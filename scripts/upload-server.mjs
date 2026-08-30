import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createTtmlHubId, insertTtmlHubId, parseTtmlMetadata, sourceIdValues, stableSongId } from "./ttml-metadata.mjs";

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

/** 已入库歌词目录的内存缓存：启动时加载一次，保存/删除时增量维护，查重为内存查找 */
const catalog = new Map(); // metaPath -> { id, metaPath, ttmlPath, meta }
const catalogIndex = new Map(); // "key:value" -> Set<catalog entry>

function indexKey(key, value) {
  return `${key}:${value}`;
}

function addToCatalog(metaPath, meta) {
  const entry = {
    id: meta.id ?? metaPath.split(sep).at(-1).replace(".meta.json", ""),
    metaPath,
    ttmlPath: metaPath.replace(/\.meta\.json$/u, ".ttml"),
    meta,
  };
  catalog.set(metaPath, entry);
  for (const [key, values] of Object.entries(meta.sourceIds ?? {})) {
    for (const value of sourceIdValues(values)) {
      const bucket = catalogIndex.get(indexKey(key, value)) ?? new Set();
      bucket.add(entry);
      catalogIndex.set(indexKey(key, value), bucket);
    }
  }
  return entry;
}

function removeFromCatalog(metaPath) {
  const entry = catalog.get(metaPath);
  if (!entry) return;
  catalog.delete(metaPath);
  for (const [key, values] of Object.entries(entry.meta.sourceIds ?? {})) {
    for (const value of sourceIdValues(values)) {
      catalogIndex.get(indexKey(key, value))?.delete(entry);
    }
  }
}

async function loadCatalog() {
  for (const metaPath of await walkMeta(lyricsRoot)) {
    try {
      addToCatalog(metaPath, JSON.parse(await readFile(metaPath, "utf8")));
    } catch {
      // The catalog validator reports malformed sidecars with a clearer path.
    }
  }
  console.log(`已加载歌词库目录缓存：${catalog.size} 首。`);
}

/** 按平台 ID 查找已入库歌词，返回全部命中项（含每项命中的具体 ID） */
function findExisting(sourceIds) {
  const seen = new Map();
  for (const [key, values] of Object.entries(sourceIds ?? {})) {
    for (const value of sourceIdValues(values)) {
      for (const entry of catalogIndex.get(indexKey(key, value)) ?? []) {
        const matchedIds = seen.get(entry) ?? [];
        matchedIds.push({ key, value });
        seen.set(entry, matchedIds);
      }
    }
  }
  return [...seen.entries()].map(([entry, matchedIds]) => ({ ...entry, matchedIds }));
}

function identity(sourceIds, requestedHubId) {
  if (Object.keys(sourceIds).length) return { sourceIds, generatedHubId: false };
  const hubId = requestedHubId === undefined ? createTtmlHubId() : String(requestedHubId).trim();
  if (!/^[a-f0-9]{16}$/iu.test(hubId)) throw new Error("自动生成的 ttmlHubId 无效，请重新选择文件");
  return { sourceIds: { ttmlHubId: [hubId.toLowerCase()] }, generatedHubId: true };
}

function publicExisting(existing) {
  return existing ? {
    id: existing.id,
    title: existing.meta.title,
    path: slash(relative(root, existing.metaPath)).replace(".meta.json", ".ttml"),
    metaPath: slash(relative(root, existing.metaPath)),
    matchedIds: existing.matchedIds,
  } : null;
}

async function inspect(content) {
  const parsed = parseTtmlMetadata(content);
  const assigned = identity(parsed.sourceIds);
  const matches = findExisting(assigned.sourceIds);
  const id = matches[0]?.id ?? stableSongId(assigned.sourceIds);
  return {
    ...parsed,
    sourceIds: assigned.sourceIds,
    generatedHubId: assigned.generatedHubId,
    id,
    suggestedPath: `lyrics/${id.slice(0, 2)}/${id}.ttml`,
    existing: matches.length === 1 ? publicExisting(matches[0]) : null,
    conflicts: matches.length > 1 ? matches.map(publicExisting) : null,
  };
}

/** 删除选中的冲突文件（仅限本次命中列表内的路径），返回被删除的标题 */
async function deleteConflicts(matches, requestedPaths) {
  const byPath = new Map(matches.map((match) => [slash(relative(root, match.metaPath)), match]));
  const titles = [];
  for (const path of requestedPaths) {
    const target = byPath.get(path);
    if (!target) throw new Error(`删除目标不在本次冲突列表中：${path}`);
    await rm(target.ttmlPath, { force: true });
    await rm(target.metaPath, { force: true });
    removeFromCatalog(target.metaPath);
    savedFiles.add(target.ttmlPath);
    savedFiles.add(target.metaPath);
    titles.push(target.meta.title ?? target.id);
  }
  return titles;
}

async function saveSong(body) {
  const parsed = parseTtmlMetadata(body.content);
  const fields = validateOverride(body, parsed);
  const assigned = identity(parsed.sourceIds, body.id);
  let matches = findExisting(assigned.sourceIds);

  // 与多份已入库歌词冲突：允许删除所选冲突文件后写入新文件
  let replacedTitles = [];
  if (matches.length > 1) {
    const requested = [...new Set([body.deletePaths ?? []].flat().map((path) => String(path).trim()).filter(Boolean))];
    if (!requested.length) {
      const titles = matches.map((match) => match.meta.title ?? match.id).join("、");
      const error = new Error(`平台 ID 命中了多首已有歌曲：${titles}，请勾选要删除替换的冲突文件`);
      error.status = 409;
      error.conflicts = matches.map(publicExisting);
      throw error;
    }
    replacedTitles = await deleteConflicts(matches, requested);
    matches = findExisting(assigned.sourceIds);
  }

  const existing = matches[0] ?? null;
  if (existing && !body.overwrite) {
    const ids = existing.matchedIds.map(({ key, value }) => `${key}: ${value}`).join("、");
    const error = new Error(`ID 已存在（${ids}）：${existing.meta.title ?? existing.id}`);
    error.status = 409;
    error.existing = publicExisting(existing);
    throw error;
  }

  const id = existing?.id ?? stableSongId(assigned.sourceIds);
  const directory = join(lyricsRoot, id.slice(0, 2));
  const ttmlPath = join(directory, `${id}.ttml`);
  const metaPath = join(directory, `${id}.meta.json`);
  const storedContent = assigned.generatedHubId ? insertTtmlHubId(body.content, sourceIdValues(assigned.sourceIds.ttmlHubId)[0]) : body.content;
  const meta = {
    id,
    title: fields.title,
    artists: fields.artists,
    album: fields.albums[0] ?? "",
    albums: fields.albums,
    language: parsed.language,
    hasTranslation: parsed.hasTranslation,
    hasTransliteration: parsed.hasTransliteration,
    aliases: (parsed.musicNames ?? []).filter((name) => name !== fields.title),
    sourceIds: assigned.sourceIds,
    author: parsed.author,
    license: String(body.license ?? "").trim(),
    sourceUrl: String(body.sourceUrl ?? "").trim(),
  };

  if (existing) removeFromCatalog(existing.metaPath);
  await mkdir(directory, { recursive: true });
  await writeFile(ttmlPath, storedContent, existing ? undefined : { flag: "wx" });
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, existing ? undefined : { flag: "wx" });
  addToCatalog(metaPath, meta);

  savedFiles.add(ttmlPath);
  savedFiles.add(metaPath);
  savedTitles.add(fields.title);
  return {
    id,
    title: fields.title,
    path: slash(relative(root, ttmlPath)),
    overwritten: Boolean(existing),
    replaced: replacedTitles,
  };
}

async function publish() {
  if (!savedFiles.size) throw new Error("本次还没有保存任何歌词");
  // 索引重建挪到这里：批量写入完成后只构建一次，而不是每首歌词都全库重建
  await exec(process.execPath, [join(root, "scripts", "build-index.mjs")], { cwd: root });
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
    json(response, error.status ?? 400, { error: error.message, existing: error.existing ?? null, conflicts: error.conflicts ?? null });
  }
});

await loadCatalog();
server.listen(port, "127.0.0.1", () => {
  console.log(`TTML 本地入库台：http://127.0.0.1:${port}`);
  console.log("此服务只监听本机，按 Ctrl+C 停止。任何保存或推送都需要你在页面中确认。");
});
