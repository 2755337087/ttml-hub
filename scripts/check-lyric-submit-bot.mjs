#!/usr/bin/env node
// 歌词提交 Issue 校验机器人
// 在 GitHub Actions 中由环境变量驱动:
//   GITHUB_TOKEN / GITHUB_REPOSITORY / ISSUE_NUMBER / ISSUE_TITLE / ISSUE_BODY / INDEX_FILE
//   ISSUE_COMMENT_BODY (issue_comment 触发时提供)
//   COMMENT_ACTION (可选):
//     "close"  -> 管理员「即将入库」开头评论，自动关闭 issue
//     "update" -> 用户「/update 直链」评论，删除旧检测结果并重新校验
// 流程: 解析 Issue 直链 -> 下载 -> 校验 -> 评论结果并打标签
//   校验失败: 打「待修改」标签，issue 保持开启，用户回复 /update 直链 重新校验
//   校验通过: 打「待人工审核」标签，管理员回复「即将入库」开头评论后自动关闭
import { readFile } from "node:fs/promises";
import { validateTtml, MAX_FILE_SIZE } from "./check-lyric-bot.mjs";

const BOT_MARK = "<!-- TTML-HUB-BOT-CHECKED -->";
const REVIEW_LABEL = "待人工审核";
const NEED_FIX_LABEL = "待修改";
const NEED_UPDATE_LABEL = "待更新";
const REVIEWED_LABEL = "已审核";
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

/** 删除本机器人之前的评论（重新校验时保持 issue 整洁），返回是否存在 */
async function deleteBotComments(issueNumber) {
  let page = 1;
  let found = false;
  for (;;) {
    const comments = await githubApi(`issues/${issueNumber}/comments?per_page=100&page=${page}`);
    if (!comments.length) break;
    for (const comment of comments) {
      // 仅删除 bot 自己的评论；用户引用回复中可能带出隐藏标记，不能误删
      const isBot = comment.user?.type === "Bot" || comment.user?.login === "github-actions[bot]";
      if (isBot && comment.body?.includes(BOT_MARK)) {
        found = true;
        await githubApi(`issues/comments/${comment.id}`, "DELETE");
        console.log(`已删除旧评论 ${comment.id}`);
      }
    }
    page += 1;
  }
  return found;
}

async function syncLabel(issueNumber, addLabel, removeLabel) {
  try {
    const labels = await githubApi(`issues/${issueNumber}/labels`);
    const names = labels.map((label) => label.name);
    if (removeLabel && names.includes(removeLabel)) {
      await githubApi(`issues/${issueNumber}/labels/${encodeURIComponent(removeLabel)}`, "DELETE");
    }
    if (!names.includes(addLabel)) {
      await githubApi(`issues/${issueNumber}/labels`, "POST", { labels: [addLabel] });
    }
  } catch (error) {
    console.log(`标签同步失败（继续执行）: ${error.message}`);
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

const RESUBMIT_HINT = "请修正歌词文件后，直接回复本 Issue：`/update 新直链`（示例：`/update https://example.com/lyric.ttml`），机器人会自动删除旧检测结果并重新校验。";

/** 转义校验文本中的尖括号，避免 GitHub Markdown 把 <head>/<span> 等当作 HTML 标签吞掉 */
function escapeAngleBrackets(text) {
  return text.replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function buildFailureComment(errors, warnings, content) {
  const parts = [BOT_MARK, "", "**歌词提交校验未通过**", "", "以下问题需要修正：", ""];
  for (const error of errors) parts.push(`- ❌ ${escapeAngleBrackets(error)}`);
  if (warnings.length) {
    parts.push("", "以下提示不阻塞提交，供参考：");
    for (const warning of warnings) parts.push(`- ⚠️ ${escapeAngleBrackets(warning)}`);
  }
  parts.push("", RESUBMIT_HINT);
  return parts.join("\n") + archiveSection(content);
}

function buildSuccessComment(warnings, content, retried) {
  const parts = [
    BOT_MARK,
    "",
    retried ? "**重新校验通过**" : "**歌词提交校验通过**",
    "",
    "歌词格式、元数据与时间轴检查均通过，已打上「待人工审核」标签，请耐心等待人工审核入库。",
  ];
  if (warnings.length) {
    parts.push("", "以下提示不影响提交，供人工审核参考：");
    for (const warning of warnings) parts.push(`- ⚠️ ${escapeAngleBrackets(warning)}`);
  }
  return parts.join("\n") + archiveSection(content);
}

/** 管理员以「即将入库」开头的评论 -> 移除审核标签、打上「已审核」并自动关闭 issue */
async function handleCloseCommand(issueNumber) {
  await syncLabel(issueNumber, REVIEWED_LABEL, REVIEW_LABEL);
  await githubApi(`issues/${issueNumber}`, "PATCH", { state: "closed" });
  console.log(`Issue #${issueNumber} 已打上「已审核」标签并自动关闭。`);
}

/** 管理员以「审核未通过」开头的评论 -> 标签改为「待更新」 */
async function handleRejectCommand(issueNumber) {
  await syncLabel(issueNumber, NEED_UPDATE_LABEL, REVIEW_LABEL);
  console.log(`Issue #${issueNumber} 已根据「审核未通过」评论打上「待更新」标签。`);
}

/** 校验歌词内容并输出评论 + 标签（供首次提交与 /update 复用） */
async function checkAndReport(issueNumber, issueTitle, content, retried) {
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
    await syncLabel(issueNumber, NEED_FIX_LABEL, REVIEW_LABEL);
    console.log("校验失败，已评论并打上「待修改」标签（issue 保持开启）。");
  } else {
    await githubApi(`issues/${issueNumber}/comments`, "POST", { body: buildSuccessComment(warnings, content, retried) });
    await syncLabel(issueNumber, REVIEW_LABEL, NEED_FIX_LABEL);
    console.log("校验通过，已评论并打上「待人工审核」标签。");
  }
}

/** issues 触发：解析 Issue 表单直链并校验 */
async function handleCheck(issueNumber, issueTitle, issueBody) {
  const retried = await deleteBotComments(issueNumber);
  if (retried) console.log("检测到已有检测结果，已删除旧评论。");

  const fields = parseIssueBody(issueBody);
  const rawUrl = (fields["歌词文件直链"] ?? "").trim();
  // 兼容空值哨兵与多行输入
  const url = rawUrl === "_No response_" ? "" : rawUrl.split("\n")[0].trim();

  const fail = async (errors) => {
    await githubApi(`issues/${issueNumber}/comments`, "POST", { body: buildFailureComment(errors, [], "") });
    await syncLabel(issueNumber, NEED_FIX_LABEL, REVIEW_LABEL);
    console.log("已评论失败原因并打上「待修改」标签。");
  };

  if (!url) {
    await fail(["未在表单中找到「歌词文件直链」，请检查后重新填写"]);
    return;
  }
  if (!/^https?:\/\//iu.test(url)) {
    await fail([`直链协议不受支持（仅 http/https）: ${url.slice(0, 100)}`]);
    return;
  }

  let content;
  try {
    console.log(`下载歌词: ${url}`);
    content = await downloadLyrics(url);
  } catch (error) {
    await fail([`歌词直链无法访问: ${error.message}`]);
    return;
  }

  await checkAndReport(issueNumber, issueTitle, content, retried);
}

/** issue_comment 触发：用户回复 /update 直链 -> 删除旧检测结果并重新校验 */
async function handleUpdateCommand(issueNumber, issueTitle, commentBody) {
  // 按行解析：任意一行以 /update 开头即视为指令（兼容引用回复场景），取最后一条
  const lines = (commentBody ?? "").split("\n").map((line) => line.trim());
  const cmdLines = lines.filter((line) => line.startsWith("/update"));
  if (!cmdLines.length) {
    // 评论中仅是引用了含 /update 的提示文案，并非指令，静默忽略
    console.log("评论中没有行首 /update 指令，忽略。");
    return;
  }
  const cmdLine = cmdLines[cmdLines.length - 1];

  const retried = await deleteBotComments(issueNumber);

  // 从指令行中提取第一个 http(s) 链接
  const urlMatch = cmdLine.match(/https?:\/\/\S+/iu);
  const url = urlMatch?.[0]?.replace(/[)\]}>.,;!?]+$/u, "");
  if (!url) {
    await githubApi(`issues/${issueNumber}/comments`, "POST", {
      body: buildFailureComment(["未从 `/update` 评论中解析出直链，请按格式回复：`/update https://example.com/lyrics.ttml`"], [], ""),
    });
    await syncLabel(issueNumber, NEED_FIX_LABEL, REVIEW_LABEL);
    return;
  }

  let content;
  try {
    console.log(`[update] 下载歌词: ${url}`);
    content = await downloadLyrics(url);
  } catch (error) {
    await githubApi(`issues/${issueNumber}/comments`, "POST", {
      body: buildFailureComment([`新歌词直链无法访问: ${error.message}`], [], ""),
    });
    await syncLabel(issueNumber, NEED_FIX_LABEL, REVIEW_LABEL);
    return;
  }

  await checkAndReport(issueNumber, issueTitle, content, retried);
}

async function main() {
  const issueNumber = Number(env("ISSUE_NUMBER"));
  const action = process.env.COMMENT_ACTION;

  if (action === "close") {
    await handleCloseCommand(issueNumber);
    return;
  }
  if (action === "reject") {
    await handleRejectCommand(issueNumber);
    return;
  }
  if (action === "update") {
    await handleUpdateCommand(issueNumber, env("ISSUE_TITLE"), env("ISSUE_COMMENT_BODY"));
    return;
  }

  await handleCheck(issueNumber, env("ISSUE_TITLE"), env("ISSUE_BODY"));
}

try {
  await main();
} catch (error) {
  console.error("机器人执行失败:", error);
  process.exit(1);
}
