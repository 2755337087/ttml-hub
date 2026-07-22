import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const lyricsRoot = new URL("../lyrics/", import.meta.url);
const publicRoot = new URL("../public/", import.meta.url);
const apiRoot = new URL("../public/api/v1/", import.meta.url);
const publicLyricsRoot = new URL("../public/lyrics/", import.meta.url);
const idPattern = /^(?<id>[a-f0-9]{16})\.ttml$/iu;

function slash(path) {
  return path.split(sep).join("/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validText(value, key, path) {
  assert(typeof value === "string" && value.trim(), `${path}: ${key} 必须是非空字符串`);
  return value.trim();
}

async function buildSong(path, seenIds, seenSourceIds) {
  const relativePath = slash(relative(fileURLToPath(lyricsRoot), path));
  const parts = relativePath.split("/");
  assert(parts.length === 2, `${relativePath}: 路径必须是 lyrics/<ID前2位>/<ID>.ttml`);
  const match = basename(path).match(idPattern);
  assert(match?.groups, `${relativePath}: 文件名必须是 16 位十六进制稳定 ID`);

  const id = match.groups.id.toLowerCase();
  assert(parts[0].toLowerCase() === id.slice(0, 2), `${relativePath}: 分片目录必须是 ID 的前两位`);
  assert(!seenIds.has(id), `${relativePath}: ID ${id} 与其他歌词重复`);
  seenIds.add(id);

  const content = await readFile(path);
  const xml = content.toString("utf8");
  assert(xml.includes("<tt") && xml.includes("</tt>"), `${relativePath}: 不是完整的 TTML 文档`);
  assert(xml.includes("<body") && xml.includes("</body>"), `${relativePath}: 缺少 TTML body`);

  const metaPath = path.slice(0, -extname(path).length) + ".meta.json";
  let meta;
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`${relativePath}: 缺少同名 .meta.json`);
    throw new Error(`${relativePath}: 元数据 JSON 无法解析`);
  }

  const title = validText(meta.title, "title", relativePath);
  const artists = meta.artists;
  assert(Array.isArray(artists) && artists.length > 0, `${relativePath}: artists 必须是非空数组`);
  artists.forEach((artist) => validText(artist, "artists[]", relativePath));
  if (meta.aliases !== undefined) assert(Array.isArray(meta.aliases), `${relativePath}: aliases 必须是数组`);
  if (meta.id !== undefined) assert(meta.id === id, `${relativePath}: 元数据 id 必须与文件名一致`);
  if (meta.albums !== undefined) assert(Array.isArray(meta.albums), `${relativePath}: albums 必须是数组`);
  if (meta.sourceIds !== undefined) assert(meta.sourceIds && typeof meta.sourceIds === "object" && !Array.isArray(meta.sourceIds), `${relativePath}: sourceIds 必须是对象`);
  for (const [key, value] of Object.entries(meta.sourceIds ?? {})) {
    validText(value, `sourceIds.${key}`, relativePath);
    const sourceKey = `${key}:${value}`;
    assert(!seenSourceIds.has(sourceKey), `${relativePath}: 平台 ID ${sourceKey} 与 ${seenSourceIds.get(sourceKey)} 重复`);
    seenSourceIds.set(sourceKey, relativePath);
  }
  const albums = meta.albums?.length ? meta.albums.map((album) => validText(album, "albums[]", relativePath)) : meta.album ? [validText(meta.album, "album", relativePath)] : [];

  return {
    id,
    title,
    artists,
    ...(albums.length ? { album: albums[0], albums } : {}),
    ...(meta.language ? { language: validText(meta.language, "language", relativePath) } : {}),
    ...(meta.aliases?.length ? { aliases: meta.aliases.map(String) } : {}),
    ...(meta.isrc ? { isrc: validText(meta.isrc, "isrc", relativePath) } : {}),
    ...(meta.license ? { license: validText(meta.license, "license", relativePath) } : {}),
    ...(meta.sourceUrl ? { sourceUrl: validText(meta.sourceUrl, "sourceUrl", relativePath) } : {}),
    ...(Object.keys(meta.sourceIds ?? {}).length ? { sourceIds: meta.sourceIds } : {}),
    path: `lyrics/${relativePath}`,
    sha256: sha256(content),
  };
}

async function main() {
  const allFiles = await walk(fileURLToPath(lyricsRoot));
  const lyricFiles = allFiles.filter((path) => path.endsWith(".ttml")).sort((a, b) => a.localeCompare(b, "zh-CN"));
  assert(lyricFiles.length > 0, "lyrics 目录中至少需要一个 .ttml 文件");

  const seenIds = new Set();
  const seenSourceIds = new Map();
  const songs = await Promise.all(lyricFiles.map((path) => buildSong(path, seenIds, seenSourceIds)));
  songs.sort((a, b) => a.title.localeCompare(b.title, "zh-CN") || a.id.localeCompare(b.id));

  const revision = sha256(JSON.stringify(songs)).slice(0, 20);
  const sourceDate = process.env.SOURCE_DATE_EPOCH;
  const generatedAt = sourceDate
    ? new Date(/^\d+$/.test(sourceDate) ? Number(sourceDate) * 1000 : sourceDate).toISOString()
    : new Date().toISOString();
  const index = { schemaVersion: 1, revision, generatedAt, songs };
  const manifest = {
    schemaVersion: 1,
    revision,
    generatedAt,
    songCount: songs.length,
    index: "songs.json",
    indexSha256: sha256(JSON.stringify(index)),
  };

  await rm(apiRoot, { recursive: true, force: true });
  await rm(publicLyricsRoot, { recursive: true, force: true });
  await mkdir(apiRoot, { recursive: true });
  await mkdir(publicRoot, { recursive: true });
  await cp(lyricsRoot, publicLyricsRoot, { recursive: true, filter: (source) => !source.endsWith(".meta.json") && !source.endsWith(".md") });
  await writeFile(new URL("songs.json", apiRoot), `${JSON.stringify(index, null, 2)}\n`);
  await writeFile(new URL("manifest.json", apiRoot), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`已索引 ${songs.length} 首歌词，revision ${revision}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
