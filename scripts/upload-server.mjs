import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseTtmlMetadata, stableSongId } from "./ttml-metadata.mjs";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const lyricsRoot = join(root, "lyrics");
const uiRoot = join(root, "tools", "uploader");
const port = Number(process.env.TTML_UPLOAD_PORT || 4173);
const savedFiles = new Set();
const savedTitles = new Set();
const maxBodyBytes = 20 * 1024 * 1024;

function slash(path) {
  return path.split(sep).join("/");
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("文件超过 20 MB 限制");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function validateOverride(body, parsed) {
  const title = String(body.title ?? parsed.title).trim();
  const artists = Array.isArray(body.artists) ? body.artists.map(String).map((value) => value.trim()).filter(Boolean) : parsed.artists;
  const albums = Array.isArray(body.albums) ? body.albums.map(String).map((value) => value.trim()).filter(Boolean) : parsed.albums;
  if (!title) throw new Error("歌曲名称不能为空");
  if (!artists.length) throw new Error("至少需要一位艺术家");
  return { title, artists: [...new Set(artists)], albums: [...new Set(albums)] };
}

async function walkMeta(directory) {
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const paths = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkMeta(path) : entry.name.endsWith(".meta.json") ? [path] : [];
  }));
  return paths.flat();
}

async function existingSong(sourceIds) {
  const pairs = Object.entries(sourceIds);
  if (!pairs.length) return null;
  for (const path of await walkMeta(lyricsRoot)) {
    try {
      const meta = JSON.parse(await readFile(path, "utf8"));
      if (pairs.some(([key, value]) => meta.sourceIds?.[key] === value)) {
        return { id: meta.id ?? path.split(sep).at(-1).replace(".meta.json", ""), metaPath: path, meta };
      }
    } catch {
      // The catalog validator reports malformed sidecars with a clearer path.
    }
  }
  return null;
}

async function inspect(content) {
  const parsed = parseTtmlMetadata(content);
  const existing = await existingSong(parsed.sourceIds);
  const id = existing?.id ?? stableSongId(parsed.sourceIds);
  return {
    ...parsed,
    id,
    suggestedPath: `lyrics/${id.slice(0, 2)}/${id}.ttml`,
    existing: existing ? { id: existing.id, title: existing.meta.title, path: slash(relative(root, existing.metaPath)).replace(".meta.json", ".ttml") } : null,
  };
}

async function saveSong(body) {
  const parsed = parseTtmlMetadata(body.content);
  const fields = validateOverride(body, parsed);
  const existing = await existingSong(parsed.sourceIds);
  if (existing && !body.overwrite) {
    const error = new Error(`这首歌已经存在：${existing.meta.title ?? existing.id}`);
    error.status = 409;
    error.existing = existing;
    throw error;
  }

  const id = existing?.id ?? stableSongId(parsed.sourceIds);
  const directory = join(lyricsRoot, id.slice(0, 2));
  const ttmlPath = join(directory, `${id}.ttml`);
  const metaPath = join(directory, `${id}.meta.json`);
  const meta = {
    id,
    title: fields.title,
    artists: fields.artists,
    album: fields.albums[0] ?? "",
    albums: fields.albums,
    language: String(body.language ?? parsed.language ?? "und").trim() || "und",
    aliases: [],
    sourceIds: parsed.sourceIds,
    author: parsed.author,
    license: String(body.license ?? "").trim(),
    sourceUrl: String(body.sourceUrl ?? "").trim(),
  };

  await mkdir(directory, { recursive: true });
  await writeFile(ttmlPath, body.content, existing ? undefined : { flag: "wx" });
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, existing ? undefined : { flag: "wx" });
  await exec(process.execPath, [join(root, "scripts", "build-index.mjs")], { cwd: root });

  savedFiles.add(ttmlPath);
  savedFiles.add(metaPath);
  savedTitles.add(fields.title);
  return { id, title: fields.title, path: slash(relative(root, ttmlPath)), overwritten: Boolean(existing) };
}

async function publish() {
  if (!savedFiles.size) throw new Error("本次还没有保存任何歌词");
  const paths = [...savedFiles].map((path) => relative(root, path));
  await exec("git", ["add", "--", ...paths], { cwd: root });
  const title = [...savedTitles].slice(0, 2).join("、");
  try {
    await exec("git", ["commit", "-m", `Add lyrics: ${title}${savedTitles.size > 2 ? " 等" : ""}`], { cwd: root });
  } catch (error) {
    if (!`${error.stdout ?? ""}${error.stderr ?? ""}`.includes("nothing to commit")) throw error;
  }
  const result = await exec("git", ["push"], { cwd: root, timeout: 120000 });
  savedFiles.clear();
  savedTitles.clear();
  return { message: "已提交并推送到 GitHub", detail: `${result.stdout}${result.stderr}`.trim() };
}

const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

async function serveStatic(pathname, response) {
  const file = pathname === "/" ? join(uiRoot, "index.html") : resolve(uiRoot, `.${pathname}`);
  if (file !== uiRoot && !file.startsWith(`${uiRoot}${sep}`)) return false;
  try {
    const content = await readFile(file);
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "POST" && url.pathname === "/api/inspect") {
      const body = await readJson(request);
      return json(response, 200, await inspect(body.content));
    }
    if (request.method === "POST" && url.pathname === "/api/save") {
      const body = await readJson(request);
      return json(response, 200, await saveSong(body));
    }
    if (request.method === "POST" && url.pathname === "/api/publish") {
      return json(response, 200, await publish());
    }
    if (request.method === "GET" && await serveStatic(url.pathname, response)) return;
    json(response, 404, { error: "Not found" });
  } catch (error) {
    json(response, error.status ?? 400, { error: error.message, existing: error.existing ?? null });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`TTML 本地入库台：http://127.0.0.1:${port}`);
  console.log("此服务只监听本机，按 Ctrl+C 停止。任何保存或推送都需要你在页面中确认。");
});
