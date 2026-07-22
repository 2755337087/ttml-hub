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

  const title = values.get("musicName")?.find(Boolean)?.trim() ?? "";
  const artists = unique(values.get("artists") ?? []);
  const albums = unique(values.get("album") ?? []);
  const rootTag = xml.match(/<tt\b([^>]*)>/iu)?.[1] ?? "";
  const language = attributes(rootTag)["xml:lang"] || "und";
  const hasTranslation = hasElement(xml, "translations");
  const hasTransliteration = hasElement(xml, "transliterations");
  const sourceIds = {};

  for (const [key, entries] of values) {
    if (/musicid$/iu.test(key) || /^(?:isrc|ttmlHubId)$/iu.test(key)) {
      const value = entries.find(Boolean)?.trim();
      if (value) sourceIds[key] = value;
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
  const key = priority.find((candidate) => sourceIds[candidate]) ?? Object.keys(sourceIds).sort()[0];
  if (!key) return randomBytes(8).toString("hex");
  if (key === "ttmlHubId" && /^[a-f0-9]{16}$/iu.test(sourceIds[key])) return sourceIds[key].toLowerCase();
  return createHash("sha256").update(`ttml-hub:${key}:${sourceIds[key]}`).digest("hex").slice(0, 16);
}

export function createTtmlHubId() {
  return randomBytes(8).toString("hex");
}

export function matchingSourceIds(left = {}, right = {}) {
  const priority = ["appleMusicId", "qqMusicId", "ncmMusicId", "isrc", "ttmlHubId"];
  const keys = [...new Set([...priority, ...Object.keys(left).sort(), ...Object.keys(right).sort()])];
  return keys
    .filter((key) => left[key] && right[key] && left[key] === right[key])
    .map((key) => ({ key, value: left[key] }));
}

export function insertTtmlHubId(xml, id) {
  if (!/^[a-f0-9]{16}$/iu.test(id)) throw new Error("ttmlHubId 必须是 16 位十六进制 ID");
  if (parseTtmlMetadata(xml).sourceIds.ttmlHubId) return xml;
  if (!/<metadata\b[^>]*>/iu.test(xml)) throw new Error("TTML 头部缺少 <metadata>，无法写入 ttmlHubId");
  return xml.replace(/<metadata\b[^>]*>/iu, (tag) => `${tag}<amll:meta key="ttmlHubId" value="${id.toLowerCase()}"/>`);
}
