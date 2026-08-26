#!/usr/bin/env node
// 歌词提交 Issue 校验机器人
// 在 GitHub Actions 中由环境变量驱动:
//   GITHUB_TOKEN / GITHUB_REPOSITORY / ISSUE_NUMBER / ISSUE_TITLE / ISSUE_BODY / INDEX_FILE
//   COMMENT_ACTION (可选): 设为 "close" 时处理 issue_comment 触发的「即将入库」关闭指令
// 流程: 解析 Issue（直链或手动输入）-> 获取歌词 -> 校验 -> 评论结果并打标签
//   校验失败: 打「待修改」标签，issue 保持开启，用户编辑后自动重新校验（删旧评论重发）
//   校验通过: 打「待人工审核」标签，等管理员回复「即将入库」开头评论后自动关闭
import { readFile } from "node:fs/promises";
import { validateTtml, MAX_FILE_SIZE } from "./check-lyric-bot.mjs";

const BOT_MARK = "<!-- TTML-HUB-BOT-CHECKED -->";
const REVIEW_LABEL = "待人工审核";
const NEED_FIX_LABEL = "待修改";
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
      if (comment.body?.includes(BOT_MARK)) {
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

function buildFailureComment(errors, warnings, content) {
  const parts = [BOT_MARK, "", "**歌词提交校验未通过**", "", "以下问题需要修正：", ""];
  for (const error of errors) parts.push(`- ❌ ${error}`);
  if (warnings.length) {
    parts.push("", "以下提示不阻塞提交，供参考：");
    for (const warning of warnings) parts.push(`- ⚠️ ${warning}`);
  }
  parts.push("", "请修正歌词文件后**编辑本 Issue 更新直链或歌词内容**，机器人会自动重新校验。");
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
    for (const warning of warnings) parts.push(`- ⚠️ ${warning}`);
  }
  return parts.join("\n") + archiveSection(content);
}

/** 清理表单空值哨兵与代码块围栏（render: xml 的 textarea 会被 GitHub 包上 ```xml 围栏） */
function cleanFieldValue(value) {
  const cleaned = (value ?? "").trim();
  if (!cleaned || cleaned === "_No response_") return "";
  return cleaned
    .replace(/^```[a-zA-Z]*\s*\n?/u, "")
    .replace(/\n?```\s*$/u, "")
    .trim();
}

/** issue_comment 触发：管理员以「即将入库」开头的评论 -> 自动关闭 issue */
async function handleCloseCommand(issueNumber) {
  await githubApi(`issues/${issueNumber}`, "PATCH", { state: "closed" });
  console.log(`Issue #${issueNumber} 已根据「即将入库」评论自动关闭。`);
}

/** issues 触发：校验歌词提交 */
async function handleCheck(issueNumber, issueTitle, issueBody) {
  const retried = await deleteBotComments(issueNumber);

  const fields = parseIssueBody(issueBody);
  const url = cleanFieldValue(fields["歌词文件直链"]).split("\n")[0];
  const inlineContent = cleanFieldValue(fields["歌词内容"]);

  const fail = async (errors, warnings = [], content = "") => {
    await githubApi(`issues/${issueNumber}/comments`, "POST", { body: buildFailureComment(errors, warnings, content) });
    await syncLabel(issueNumber, NEED_FIX_LABEL, REVIEW_LABEL);
    console.log("校验失败，已评论并打上「待修改」标签（issue 保持开启）。");
  };

  // 两种提交方式均未填写
  if (!url && !inlineContent) {
    await fail(["请填写「歌词文件直链」或「歌词内容」其中一项"]);
    return;
  }

  let content = "";
  if (inlineContent) {
    // 手动输入优先（两者都填时以手动输入为准）
    content = inlineContent;
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_SIZE) {
      await fail([`歌词内容超过 1MB 大小限制，请改用直链提交`]);
      return;
    }
    console.log(`使用手动输入的歌词内容（${(Buffer.byteLength(content, "utf8") / 1024).toFixed(1)}KB）`);
  } else {
    if (!/^https?:\/\//iu.test(url)) {
      await fail([`直链协议不受支持（仅 http/https）: ${url.slice(0, 100)}`]);
      return;
    }
    try {
      console.log(`下载歌词: ${url}`);
      content = await downloadLyrics(url);
    } catch (error) {
      await fail([`歌词直链无法访问: ${error.message}`]);
      return;
    }
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
    await fail(errors, warnings, content);
  } else {
    await githubApi(`issues/${issueNumber}/comments`, "POST", { body: buildSuccessComment(warnings, content, retried) });
    await syncLabel(issueNumber, REVIEW_LABEL, NEED_FIX_LABEL);
    console.log("校验通过，已评论并打上「待人工审核」标签。");
  }
}

async function main() {
  const issueNumber = Number(env("ISSUE_NUMBER"));

  if (process.env.COMMENT_ACTION === "close") {
    await handleCloseCommand(issueNumber);
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
