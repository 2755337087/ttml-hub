#!/usr/bin/env node
// 歌词提交 Issue 校验机器人
// 在 GitHub Actions 中由环境变量驱动:
//   GITHUB_TOKEN / GITHUB_REPOSITORY / ISSUE_NUMBER / ISSUE_TITLE / ISSUE_BODY / INDEX_FILE
// 流程: 解析 Issue 直链 -> 下载 -> 校验 -> 评论结果（失败关闭 issue，通过打「待人工审核」标签）
import { readFile } from "node:fs/promises";
import { validateTtml, MAX_FILE_SIZE } from "./check-lyric-bot.mjs";

const BOT_MARK = "<!-- TTML-HUB-BOT-CHECKED -->";
const REVIEW_LABEL = "待人工审核";
const DOWNLOAD_TIMEOUT_MS = 30_000;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`缺少环境变量 ${name}`);
  return value;
}

/** 按 "### 字段名" 分段解析 Issue 表单正文 */
function parseIssueBody(body) {
  const params = {};
  let currentKey = null;
  let currentValue = "";
  for (const line of (body ?? "").split("\n")) {
    if (line.startsWith("### ")) {
      if (currentKey) params[currentKey] = currentValue.trim();
      currentKey = line.slice(4).trim();
      currentValue = "";
    } else if (currentKey) {
      currentValue += `${line.trim()}\n`;
    }
  }
  if (currentKey) params[currentKey] = currentValue.trim();
  return params;
}

async function githubApi(path, method = "GET", body) {
  const repo = env("GITHUB_REPOSITORY");
  const resp = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env("GITHUB_TOKEN")}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`GitHub API ${method} ${path} -> ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  return resp.status === 204 ? null : resp.json();
}

async function hasBotCommented(issueNumber) {
  let page = 1;
  for (;;) {
    const comments = await githubApi(`issues/${issueNumber}/comments?per_page=100&page=${page}`);
    if (!comments.length) return false;
    if (comments.some((comment) => comment.body?.includes(BOT_MARK))) return true;
    page += 1;
  }
}

async function downloadLyrics(url) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { "User-Agent": "ttml-hub-lyric-checker/1.0" },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`下载失败: HTTP ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  if (buffer.byteLength > MAX_FILE_SIZE) throw new Error(`文件超过 1MB 大小限制（实际 ${(buffer.byteLength / 1024).toFixed(1)}KB）`);
  return buffer.toString("utf8");
}

function archiveSection(content) {
  if (!content) return "";
  const trimmed = content.length > 60000 ? `${content.slice(0, 60000)}\n...（内容过长已截断）` : content;
  return `\n<details>\n<summary>歌词文件原文存档</summary>\n\n\`\`\`xml\n${trimmed}\n\`\`\`\n\n</details>\n`;
}

function buildFailureComment(errors, warnings, content) {
  const parts = [BOT_MARK, "", "**歌词提交校验未通过**", "", "以下问题需要修正：", ""];
  for (const error of errors) parts.push(`- ❌ ${error}`);
  if (warnings.length) {
    parts.push("", "以下问题不阻塞提交，供参考：");
    for (const warning of warnings) parts.push(`- ⚠️ ${warning}`);
  }
  parts.push("", "请修正歌词文件后重新提交（可编辑原 Issue 更新直链后重新发起）。");
  return parts.join("\n") + archiveSection(content);
}

function buildSuccessComment(warnings, content) {
  const parts = [BOT_MARK, "", "**歌词提交校验通过**", "", "歌词格式、元数据与时间轴检查均通过，已打上「待人工审核」标签，请耐心等待人工审核入库。"];
  if (warnings.length) {
    parts.push("", "以下提示不影响提交，供人工审核参考：");
    for (const warning of warnings) parts.push(`- ⚠️ ${warning}`);
  }
  return parts.join("\n") + archiveSection(content);
}

async function main() {
  const issueNumber = Number(env("ISSUE_NUMBER"));
  const issueTitle = env("ISSUE_TITLE");
  const issueBody = env("ISSUE_BODY");

  if (await hasBotCommented(issueNumber)) {
    console.log(`Issue #${issueNumber} 已被机器人处理过，跳过。`);
    return;
  }

  const fields = parseIssueBody(issueBody);
  const url = fields["歌词文件直链"]?.split("\n")[0]?.trim() ?? "";
  if (!url) {
    await githubApi(`issues/${issueNumber}/comments`, "POST", {
      body: buildFailureComment(["无法在 Issue 中找到「歌词文件直链」"], [], ""),
    });
    await githubApi(`issues/${issueNumber}`, "PATCH", { state: "closed" });
    console.log("缺少直链，已评论并关闭。");
    return;
  }
  if (!/^https?:\/\//iu.test(url)) {
    await githubApi(`issues/${issueNumber}/comments`, "POST", {
      body: buildFailureComment([`直链协议不受支持（仅 http/https）: ${url.slice(0, 100)}`], [], ""),
    });
    await githubApi(`issues/${issueNumber}`, "PATCH", { state: "closed" });
    console.log("直链协议非法，已评论并关闭。");
    return;
  }

  let content = "";
  try {
    console.log(`下载歌词: ${url}`);
    content = await downloadLyrics(url);
  } catch (error) {
    await githubApi(`issues/${issueNumber}/comments`, "POST", {
      body: buildFailureComment([`歌词直链无法访问: ${error.message}`], [], ""),
    });
    await githubApi(`issues/${issueNumber}`, "PATCH", { state: "closed" });
    console.log(`下载失败，已评论并关闭: ${error.message}`);
    return;
  }

  let indexSongs = [];
  try {
    const index = JSON.parse(await readFile(env("INDEX_FILE"), "utf8"));
    indexSongs = index.songs ?? index;
  } catch (error) {
    console.log(`警告: 无法读取索引（跳过重复检查）: ${error.message}`);
  }

  const { errors, warnings } = validateTtml(content, { indexSongs, issueTitle });
  console.log(`校验完成: errors=${errors.length} warnings=${warnings.length}`);

  if (errors.length) {
    await githubApi(`issues/${issueNumber}/comments`, "POST", { body: buildFailureComment(errors, warnings, content) });
    await githubApi(`issues/${issueNumber}`, "PATCH", { state: "closed" });
    console.log("校验失败，已评论并关闭 Issue。");
  } else {
    await githubApi(`issues/${issueNumber}/comments`, "POST", { body: buildSuccessComment(warnings, content) });
    await githubApi(`issues/${issueNumber}/labels`, "POST", { labels: [REVIEW_LABEL] });
    console.log("校验通过，已评论并打上「待人工审核」标签。");
  }
}

try {
  await main();
} catch (error) {
  console.error("机器人执行失败:", error);
  process.exit(1);
}
