#!/usr/bin/env node
// TTML 歌词提交校验器
// 用法: node scripts/check-lyric-bot.mjs <file.ttml> [--index public/api/v1/songs.json] [--issue-title "歌名 - 艺术家 - 专辑"]
// 输出 JSON { errors: [], warnings: [] }；退出码 0 = 通过（可含警告），2 = 校验失败
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseTtmlMetadata } from "./ttml-metadata.mjs";

export const MAX_FILE_SIZE = 1024 * 1024;
export const PLATFORM_ID_KEYS = ["appleMusicId", "ncmMusicId", "qqMusicId", "isrc"];

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

/** 解析 TTML 时间戳（"18.144" 或 "1:00.180"），非法返回 null */
export function parseTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value.trim().match(/^(?:(\d+):(\d{1,2})(?:\.(\d+))?|(\d+)(?:\.(\d+))?)$/u);
  if (!match) return null;
  if (match[1] !== undefined) {
    return Number(match[1]) * 60 + Number(`${match[2]}.${match[3] ?? 0}`);
  }
  return Number(`${match[4]}.${match[5] ?? 0}`);
}

/** 栈式标签配对校验（#5），返回错误列表 */
function checkWellFormed(xml) {
  const errors = [];
  const cleaned = xml
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<\?[\s\S]*?\?>/gu, "")
    .replace(/<!DOCTYPE[\s\S]*?>/giu, "");
  const stack = [];
  const tagRe = /<(\/)?([\w:.-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/)?>/gu;
  let match;
  while ((match = tagRe.exec(cleaned))) {
    const [, closing, name, , selfClosing] = match;
    if (closing) {
      const top = stack.pop();
      if (top !== name) {
        errors.push(top === undefined
          ? `XML 结构错误: 出现多余的闭合标签 </${name}>`
          : `XML 结构错误: 闭合标签 </${name}> 与未闭合的 <${top}> 不匹配`);
        return errors;
      }
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  if (stack.length) {
    errors.push(`XML 结构错误: 标签 <${stack[stack.length - 1]}> 未闭合`);
  }
  return errors;
}

/**
 * 递归展平嵌套 <span>，只返回叶子 span（无子 span 的最内层）
 * 背景和声常用外层 span 包裹整组内层逐字 span，外层只作分组不能当作"字"
 */
function extractSpans(fragment) {
  const spans = [];
  const stack = [];
  const tagRe = /<span\b([^>]*?)(\/)?>|<\/span\s*>/giu;
  let match;
  while ((match = tagRe.exec(fragment))) {
    if (match[0].startsWith("</")) {
      const open = stack.pop();
      if (!open) continue;
      if (!open.hasChild) {
        const text = fragment.slice(open.contentStart, match.index);
        spans.push({ attrs: open.attrs, text: decodeXml(text.replace(/<[^>]*>/gu, "")) });
      }
    } else if (match[2]) {
      // 自闭合 span（无文本）
      if (stack.length) stack[stack.length - 1].hasChild = true;
      spans.push({ attrs: attributes(match[1]), text: "" });
    } else {
      if (stack.length) stack[stack.length - 1].hasChild = true;
      stack.push({ attrs: attributes(match[1]), contentStart: match.index + match[0].length, hasChild: false });
    }
  }
  return spans;
}

/** 提取所有 <p> 行及其内部 <span> 逐字信息 */
function extractLines(xml) {
  const lines = [];
  for (const pMatch of xml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/giu)) {
    const pAttrs = attributes(pMatch[1]);
    lines.push({
      attrs: pAttrs,
      spans: extractSpans(pMatch[2]),
      text: decodeXml(pMatch[2].replace(/<[^>]*>/gu, "")),
      begin: parseTime(pAttrs.begin),
      end: parseTime(pAttrs.end),
    });
  }
  return lines;
}

/**
 * 校验 TTML 歌词内容
 * @param {string} xml TTML 文档全文
 * @param {{ indexSongs?: Array<{title: string, artists: string[], album?: string, sourceIds: Record<string, string[]>}>, issueTitle?: string }} options
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateTtml(xml, options = {}) {
  const errors = [];
  const warnings = [];
  const { indexSongs = [], issueTitle = "" } = options;

  // #4 完整 TTML 文档
  if (typeof xml !== "string" || !xml.includes("<tt") || !xml.includes("</tt>")) {
    return { errors: ["文件不是完整的 TTML 文档（缺少 <tt> 根元素）"], warnings };
  }
  if (!xml.includes("<body") || !xml.includes("</body>")) {
    return { errors: ["TTML 缺少 <body> 歌词正文"], warnings };
  }

  // #5 XML 结构
  errors.push(...checkWellFormed(xml));
  if (errors.length) return { errors, warnings };

  // 元数据（#8-#12）
  let detected;
  try {
    detected = parseTtmlMetadata(xml);
  } catch (error) {
    return { errors: [`元数据解析失败: ${error.message}`], warnings };
  }
  if (!detected.title) errors.push("缺少元数据 musicName（歌曲标题）");
  if (!detected.artists.length) errors.push("缺少元数据 artists（艺术家，多个用 / 分隔）");
  if (!detected.albums.length) errors.push("缺少元数据 album（专辑名称，单曲专辑请填歌曲名）");

  const rootAttrs = attributes(xml.match(/<tt\b([^>]*)>/iu)?.[1] ?? "");
  if (!rootAttrs["xml:lang"]) errors.push("缺少 xml:lang 语言标记（根元素 <tt> 上，如 zh-Hans）");

  const platformIds = Object.fromEntries(
    PLATFORM_ID_KEYS.filter((key) => detected.sourceIds[key]?.length).map((key) => [key, detected.sourceIds[key]]),
  );
  if (!Object.keys(platformIds).length) {
    errors.push(`缺少音乐平台 ID 元数据（appleMusicId / ncmMusicId / qqMusicId / isrc 至少一项）`);
  }

  // #13 与 issue 标题一致性（警告）
  const titlePart = issueTitle.replace(/^\[[^\]]*\]\s*/u, "").trim();
  if (titlePart) {
    const [issueTitleText, issueArtistText, issueAlbumText] = titlePart.split(/\s+-\s+/u);
    const check = (actual, claimed, label) => {
      if (claimed && actual && !actual.includes(claimed.trim()) && !claimed.trim().includes(actual)) {
        warnings.push(`元数据与 Issue 信息可能不一致: ${label}（Issue 填写「${claimed.trim()}」，歌词文件为「${actual}」）`);
      }
    };
    check(detected.title, issueTitleText, "歌曲标题");
    check(detected.artists.join(" / "), issueArtistText, "艺术家");
    check(detected.albums[0], issueAlbumText, "专辑");
  }

  // #22 平台 ID 与库内重复
  const submittedIds = Object.entries(platformIds).flatMap(([key, values]) => values.map((value) => `${key}:${value}`));
  const indexMap = new Map();
  for (const song of indexSongs) {
    for (const [key, values = []] of Object.entries(song.sourceIds ?? {})) {
      for (const value of values) indexMap.set(`${key}:${value}`, song);
    }
  }
  for (const id of submittedIds) {
    const existing = indexMap.get(id);
    if (existing) {
      errors.push(`平台 ID ${id} 已存在（对应库内歌曲《${existing.title}》），同一平台 ID 仅允许归属一份歌词`);
    }
  }

  // 歌词行与时间轴（#6-#7, #14-#21）
  const lines = extractLines(xml);
  if (!lines.length) {
    errors.push("歌词正文为空（没有 <p> 歌词行）");
  }

  let hasNonZeroTime = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLabel = `第 ${i + 1} 行`;

    // #6 逐字判定：行内至少一个带 begin/end 的 span
    const timedSpans = line.spans.filter((span) => span.attrs.begin !== undefined || span.attrs.end !== undefined);
    if (!timedSpans.length) {
      errors.push(`${lineLabel}不是逐字歌词（缺少带 begin/end 时间属性的 <span>）`);
    }

    // #21 空行（含 p 标签直接文本）
    if (!line.text.trim() && !line.attrs["itunes:instrumental"]) {
      warnings.push(`${lineLabel}内容为空`);
    }

    // #14 行时间格式
    if (line.attrs.begin !== undefined && line.begin === null) {
      errors.push(`${lineLabel}begin 时间格式非法: "${line.attrs.begin}"（应为 18.144 或 1:00.180 格式）`);
    }
    if (line.attrs.end !== undefined && line.end === null) {
      errors.push(`${lineLabel}end 时间格式非法: "${line.attrs.end}"`);
    }

    // #15 行 end >= begin
    if (line.begin !== null && line.end !== null && line.end < line.begin) {
      errors.push(`${lineLabel}结束时间 (${line.attrs.end}) 早于开始时间 (${line.attrs.begin})`);
    }

    if (line.begin !== null && line.begin > 0) hasNonZeroTime = true;
    if (line.end !== null && line.end > 0) hasNonZeroTime = true;

    // 逐字时间轴（主唱与背景和声分轨检测：括号标注归背景轨，两轨各自独立比较）
    let inBackground = false;
    const prevSpanEnd = { main: null, bg: null };
    for (let j = 0; j < line.spans.length; j++) {
      const span = line.spans[j];
      if (span.attrs.begin === undefined && span.attrs.end === undefined) continue;
      const spanLabel = `${lineLabel}第 ${j + 1} 个字「${span.text.trim() || " "}」`;

      const isBackground = inBackground || /[(（]/u.test(span.text);
      const track = isBackground ? "bg" : "main";
      inBackground = /[)）]/u.test(span.text) ? false : isBackground;

      const begin = parseTime(span.attrs.begin ?? "");
      const end = parseTime(span.attrs.end ?? "");
      if (span.attrs.begin !== undefined && begin === null) {
        errors.push(`${spanLabel}begin 时间格式非法: "${span.attrs.begin}"`);
      }
      if (span.attrs.end !== undefined && end === null) {
        errors.push(`${spanLabel}end 时间格式非法: "${span.attrs.end}"`);
      }
      if (begin !== null && begin > 0) hasNonZeroTime = true;
      if (end !== null && end > 0) hasNonZeroTime = true;

      // #15 字 end >= begin
      if (begin !== null && end !== null && end < begin) {
        errors.push(`${spanLabel}结束时间早于开始时间`);
      }
      // #16 同轨字时间单调（主唱/背景和声各自独立比较）
      if (prevSpanEnd[track] !== null && begin !== null && begin < prevSpanEnd[track]) {
        warnings.push(`${spanLabel}开始时间早于同轨前一个字的结束时间${track === "bg" ? "（背景和声轨）" : ""}`);
      }
      if (end !== null) prevSpanEnd[track] = end;

      // #17 行覆盖字（警告，仅主唱轨：行级时间轴只描述主唱，背景和声可超出）
      if (track === "main") {
        if (line.begin !== null && begin !== null && begin < line.begin) {
          warnings.push(`${spanLabel}开始时间早于所在行的开始时间`);
        }
        if (line.end !== null && end !== null && end > line.end) {
          warnings.push(`${spanLabel}结束时间晚于所在行的结束时间`);
        }
      }
    }
  }

  // #19 全零时间戳
  if (lines.length && !hasNonZeroTime) {
    errors.push("所有时间戳均为 0，疑似占位文件");
  }

  // #20 body dur（警告）
  const bodyAttrs = attributes(xml.match(/<body\b([^>]*)>/iu)?.[1] ?? "");
  if (!bodyAttrs.dur) warnings.push("<body> 缺少 dur 总时长属性（部分播放器需要）");

  // #23 注入风险（警告）
  if (/<\s*script\b/iu.test(xml) || /\bon\w+\s*=\s*["']/iu.test(xml)) {
    warnings.push("文件中包含 script 标签或 on* 事件属性，请人工确认内容安全");
  }

  return { errors, warnings };
}

/** CLI 入口 */
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) {
    console.error("用法: node scripts/check-lyric-bot.mjs <file.ttml> [--index songs.json] [--issue-title \"...\"]");
    process.exit(1);
  }
  const getOpt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const content = await readFile(file, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_SIZE) {
    console.log(JSON.stringify({ errors: ["文件超过 1MB 大小限制"], warnings: [] }));
    process.exit(2);
  }

  let indexSongs = [];
  const indexFile = getOpt("index");
  if (indexFile) {
    const index = JSON.parse(await readFile(indexFile, "utf8"));
    indexSongs = index.songs ?? index;
  }

  const result = validateTtml(content, { indexSongs, issueTitle: getOpt("issue-title") ?? "" });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length ? 2 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/gu, "/")) {
  await main();
}
