import { createHash, randomBytes } from "node:crypto";

function decodeXml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function attributes(fragment) {
  const result = {};
  for (const match of fragment.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu)) {
    result[match[1]] = decodeXml(match[2] ?? match[3] ?? "");
  }
  return result;
}

function unique(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Returns a de-duplicated list while accepting legacy single-value sidecars. */
export function sourceIdValues(value) {
  return unique(Array.isArray(value) ? value.map(String) : value === undefined || value === null ? [] : [String(value)]);
}

function hasElement(xml, localName) {
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/gu, "");
  return new RegExp(`<(?:[\\w.-]+:)?${localName}\\b`, "iu").test(withoutComments);
}

export function parseTtmlMetadata(xml) {
  if (typeof xml !== "string" || !xml.includes("<tt") || !xml.includes("</tt>")) {
    throw new Error("文件不是完整的 TTML 文档");
  }

  const head = xml.match(/<head\b[\s\S]*?<\/head>/iu)?.[0];
  if (!head) throw new Error("TTML 头部缺少 <head> 元数据");

  const values = new Map();
  for (const match of head.matchAll(/<amll:meta\b([^>]*?)(?:\/?>)/giu)) {
    const attrs = attributes(match[1]);
    if (!attrs.key || attrs.value === undefined) continue;
    const list = values.get(attrs.key) ?? [];
    list.push(attrs.value);
    values.set(attrs.key, list);
  }

  const musicNames = unique(values.get("musicName") ?? []);
  const title = musicNames[0] ?? "";
  const artists = unique(values.get("artists") ?? []);
  const albums = unique(values.get("album") ?? []);
  const rootTag = xml.match(/<tt\b([^>]*)>/iu)?.[1] ?? "";
  const language = attributes(rootTag)["xml:lang"] || "und";
  const hasTranslation = hasElement(xml, "translations");
  const hasTransliteration = hasElement(xml, "transliterations");
  const sourceIds = {};

  for (const [key, entries] of values) {
    if (/musicid$/iu.test(key) || /^(?:isrc|ttmlHubId)$/iu.test(key)) {
      const ids = unique(entries);
      if (ids.length) sourceIds[key] = ids;
    }
  }

  const author = {
    ...(values.get("ttmlAuthorGithub")?.[0] ? { githubId: values.get("ttmlAuthorGithub")[0] } : {}),
    ...(values.get("ttmlAuthorGithubLogin")?.[0] ? { githubLogin: values.get("ttmlAuthorGithubLogin")[0] } : {}),
  };

  const missing = [];
  if (!title) missing.push("musicName");
  if (!artists.length) missing.push("artists");

  return {
    title,
    musicNames,
    artists,
    albums,
    language,
    hasTranslation,
    hasTransliteration,
    sourceIds,
    author,
    missing,
    rawMeta: Object.fromEntries(values),
  };
}

export function stableSongId(sourceIds = {}) {
  const priority = ["ttmlHubId", "isrc", "appleMusicId", "qqMusicId", "ncmMusicId"];
  const key = priority.find((candidate) => sourceIdValues(sourceIds[candidate]).length)
    ?? Object.keys(sourceIds).sort().find((candidate) => sourceIdValues(sourceIds[candidate]).length);
  if (!key) return randomBytes(8).toString("hex");
  const value = sourceIdValues(sourceIds[key])[0];
  if (key === "ttmlHubId" && /^[a-f0-9]{16}$/iu.test(value)) return value.toLowerCase();
  return createHash("sha256").update(`ttml-hub:${key}:${value}`).digest("hex").slice(0, 16);
}

export function createTtmlHubId() {
  return randomBytes(8).toString("hex");
}

export function matchingSourceIds(left = {}, right = {}) {
  const priority = ["appleMusicId", "qqMusicId", "ncmMusicId", "isrc", "ttmlHubId"];
  const keys = [...new Set([...priority, ...Object.keys(left).sort(), ...Object.keys(right).sort()])];
  return keys.flatMap((key) => {
    const rightIds = new Set(sourceIdValues(right[key]));
    return sourceIdValues(left[key])
      .filter((value) => rightIds.has(value))
      .map((value) => ({ key, value }));
  });
}

export function insertTtmlHubId(xml, id) {
  if (!/^[a-f0-9]{16}$/iu.test(id)) throw new Error("ttmlHubId 必须是 16 位十六进制 ID");
  if (sourceIdValues(parseTtmlMetadata(xml).sourceIds.ttmlHubId).length) return xml;
  if (!/<metadata\b[^>]*>/iu.test(xml)) throw new Error("TTML 头部缺少 <metadata>，无法写入 ttmlHubId");
  return xml.replace(/<metadata\b[^>]*>/iu, (tag) => `${tag}<amll:meta key="ttmlHubId" value="${id.toLowerCase()}"/>`);
}
