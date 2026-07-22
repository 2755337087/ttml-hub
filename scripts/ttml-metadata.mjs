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
  return createHash("sha256").update(`ttml-hub:${key}:${sourceIds[key]}`).digest("hex").slice(0, 16);
}
