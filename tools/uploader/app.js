const drop = document.querySelector("#drop-zone");
const input = document.querySelector("#file-input");
const panel = document.querySelector("#batch-panel");
const list = document.querySelector("#batch-list");
const count = document.querySelector("#batch-count");
const notice = document.querySelector("#notice");
const addFilesButton = document.querySelector("#add-files");
const saveButton = document.querySelector("#save-button");
const publishButton = document.querySelector("#publish-button");

const items = [];
let busy = false;

const stateNames = {
  queued: "等待解析",
  reading: "正在解析",
  ready: "可以写入",
  warning: "需要补充",
  duplicate: "发现重复",
  saving: "正在写入",
  saved: "已写入",
  skipped: "已跳过",
  published: "已推送",
  invalid: "无法解析",
  error: "写入失败",
};

const languageNames = {
  "zh-Hans": "简体中文",
  "zh-Hant": "繁体中文",
  en: "英语",
  ja: "日语",
  ko: "韩语",
  ru: "俄语",
  tr: "土耳其语",
  id: "印度尼西亚语",
  vi: "越南语",
  th: "泰语",
  es: "西班牙语",
  hi: "印地语",
  pt: "葡萄牙语",
  fr: "法语",
  de: "德语",
  it: "意大利语",
  ar: "阿拉伯语",
  und: "未指定语言",
};

const sourceIdNames = {
  appleMusicId: "Apple Music ID",
  qqMusicId: "QQ 音乐 ID",
  ncmMusicId: "网易云音乐 ID",
  isrc: "ISRC",
  ttmlHubId: "TTML Hub ID",
};

function message(text, type = "") {
  notice.textContent = text;
  notice.className = type;
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function splitLines(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function itemKey(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function updateCount() {
  const pending = items.filter((item) => item.inspection && !["saved", "published"].includes(item.state)).length;
  const completed = items.filter((item) => ["saved", "published"].includes(item.state)).length;
  count.textContent = `${items.length} 个文件 · ${pending} 个待处理 · ${completed} 个已完成`;
  panel.hidden = items.length === 0;
  drop.classList.toggle("compact", items.length > 0);
  saveButton.disabled = busy || !items.some((item) => item.inspection && !["saved", "published", "saving"].includes(item.state));
  publishButton.disabled = busy || !items.some((item) => item.state === "saved");
}

function setState(item, state, detail = "") {
  item.state = state;
  item.detail = detail;
  if (item.card) {
    item.card.dataset.state = state;
    const badge = item.card.querySelector(".status");
    badge.textContent = stateNames[state] || state;
    badge.title = detail;
    const note = item.card.querySelector(".item-note");
    if (note) {
      note.textContent = detail;
      note.hidden = !detail;
    }
  }
  updateCount();
}

function makeField(label, value, options = {}) {
  const wrapper = element("label", options.wide ? "field wide" : "field");
  const caption = element("span", "field-label", label);
  const control = document.createElement(options.area ? "textarea" : "input");
  if (options.type) control.type = options.type;
  if (options.placeholder) control.placeholder = options.placeholder;
  if (options.readOnly) control.readOnly = true;
  control.value = value || "";
  if (options.required) control.required = true;
  wrapper.append(caption, control);
  return { wrapper, control };
}

function removeItem(item) {
  if (["saving", "saved"].includes(item.state)) return;
  const index = items.indexOf(item);
  if (index >= 0) items.splice(index, 1);
  item.card.remove();
  updateCount();
  if (!items.length) message("等待选择 TTML 文件");
}

function renderItem(item) {
  const card = item.card || element("article", "lyric-item");
  card.replaceChildren();
  item.card = card;
  card.dataset.state = item.state;

  const top = element("div", "item-top");
  const summary = element("div", "item-summary");
  const title = element("strong", "item-title", item.inspection?.title || item.file.name);
  const subtitle = element(
    "span",
    "item-subtitle",
    item.inspection?.artists?.length ? item.inspection.artists.join("、") : item.file.name,
  );
  summary.append(title, subtitle);

  const controls = element("div", "item-controls");
  const badge = element("span", "status", stateNames[item.state]);
  const remove = element("button", "remove", "移除");
  remove.type = "button";
  remove.addEventListener("click", () => removeItem(item));
  controls.append(badge, remove);
  top.append(summary, controls);
  card.append(top);

  const note = element("p", "item-note", item.detail || "");
  note.hidden = !item.detail;
  card.append(note);

  if (!item.inspection) {
    if (!item.card.isConnected) list.append(card);
    return;
  }

  const path = element("code", "path", item.inspection.suggestedPath);
  card.append(path);

  const features = element("div", "feature-tags");
  const language = item.inspection.language || "und";
  features.append(
    element("span", "feature-tag", `${languageNames[language] || "其他语言"} · ${language}`),
    element("span", item.inspection.hasTranslation ? "feature-tag yes" : "feature-tag no", item.inspection.hasTranslation ? "有翻译" : "无翻译"),
    element("span", item.inspection.hasTransliteration ? "feature-tag yes" : "feature-tag no", item.inspection.hasTransliteration ? "有注音" : "无注音"),
  );
  card.append(features);

  const details = element("details", "item-details");
  details.open = Boolean(item.inspection.existing || item.inspection.missing.length);
  details.append(element("summary", "", "检查和编辑元数据"));
  const fields = element("div", "item-fields");
  const titleField = makeField("歌曲名称", item.inspection.title, { required: true });
  const languageField = makeField("语言（来自 xml:lang）", item.inspection.language, { readOnly: true });
  const artistsField = makeField("艺术家（每行一位）", item.inspection.artists.join("\n"), { area: true, required: true, wide: true });
  const albumsField = makeField("专辑（每行一个）", item.inspection.albums.join("\n"), { area: true, wide: true });
  const licenseField = makeField("授权", "", { placeholder: "例如 CC BY 4.0" });
  const sourceUrlField = makeField("来源网址", "", { type: "url", placeholder: "https://…" });
  fields.append(
    titleField.wrapper,
    languageField.wrapper,
    artistsField.wrapper,
    albumsField.wrapper,
    licenseField.wrapper,
    sourceUrlField.wrapper,
  );
  details.append(fields);

  const identity = element("div", "item-identity");
  const idLabel = element("span", "", "平台 ID");
  const ids = Object.entries(item.inspection.sourceIds)
    .map(([key, value]) => `${sourceIdNames[key] || key}: ${value}`)
    .join(" · ");
  identity.append(idLabel, element("code", "", ids));
  if (item.inspection.generatedHubId) {
    identity.append(element("span", "", "ID 说明"), element("code", "", "未检测到平台 ID，保存时会把上述永久 TTML Hub ID 写入歌词文件。"));
  }
  details.append(identity);

  let overwrite = null;
  if (item.inspection.existing) {
    const duplicate = element("label", "overwrite-control");
    overwrite = document.createElement("input");
    overwrite.type = "checkbox";
    const existing = item.inspection.existing;
    const matchedIds = existing.matchedIds
      .map(({ key, value }) => `${sourceIdNames[key] || key}: ${value}`)
      .join("、");
    duplicate.append(overwrite, element("span", "", `ID 相同（${matchedIds}），视为同一首歌曲：${existing.title}（${existing.path}）`));
    overwrite.addEventListener("change", () => {
      const next = item.inspection.missing.length ? "warning" : (overwrite.checked ? "ready" : "duplicate");
      setState(item, next, overwrite.checked ? "已允许覆盖这个文件。" : "默认不会覆盖；勾选后才会写入。 ");
    });
    details.append(duplicate);
  }

  item.fields = {
    title: titleField.control,
    language: languageField.control,
    artists: artistsField.control,
    albums: albumsField.control,
    license: licenseField.control,
    sourceUrl: sourceUrlField.control,
    overwrite,
  };
  card.append(details);
  if (!card.isConnected) list.append(card);
}

async function request(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "请求失败");
    error.status = response.status;
    error.result = result;
    throw error;
  }
  return result;
}

async function addFiles(fileList) {
  const selected = [...fileList];
  const candidates = selected.filter((file) => file.name.toLowerCase().endsWith(".ttml"));
  const known = new Set(items.map((item) => item.key));
  const fresh = candidates.filter((file) => !known.has(itemKey(file)));
  const freshItems = [];

  for (const file of fresh) {
    const item = { key: itemKey(file), file, state: "queued", detail: "", inspection: null, content: "", fields: null, card: null };
    items.push(item);
    freshItems.push(item);
    renderItem(item);
  }
  updateCount();

  if (!fresh.length) {
    message(candidates.length ? "这些文件已经在导入列表中。" : "没有找到 .ttml 文件。", "error");
    return;
  }

  busy = true;
  updateCount();
  for (let index = 0; index < freshItems.length; index += 1) {
    const item = freshItems[index];
    setState(item, "reading", `正在解析 ${index + 1}/${freshItems.length}`);
    message(`正在解析 ${index + 1}/${freshItems.length}：${item.file.name}`);
    try {
      item.content = await item.file.text();
      item.inspection = await request("/api/inspect", { content: item.content });
      item.detail = "";
      renderItem(item);
      if (item.inspection.existing) {
        setState(item, "duplicate", "默认不会覆盖；勾选后才会写入。");
      } else if (item.inspection.missing.length) {
        setState(item, "warning", `头部缺少：${item.inspection.missing.join("、")}，请补充后再写入。`);
      } else {
        setState(item, "ready", "元数据读取完成。 ");
      }
    } catch (error) {
      renderItem(item);
      setState(item, "invalid", error.message);
    }
  }
  busy = false;
  updateCount();
  const invalidCount = freshItems.filter((item) => item.state === "invalid").length;
  message(
    invalidCount ? `解析完成，其中 ${invalidCount} 个文件无法读取，请检查标红项目。` : `已解析 ${fresh.length} 个文件，请检查后批量写入。`,
    invalidCount ? "error" : "success",
  );
}

async function saveAll() {
  if (busy) return;
  const candidates = items.filter((item) => item.inspection && !["saved", "published"].includes(item.state));
  if (!candidates.length) return message("没有需要写入的歌词。", "error");

  busy = true;
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  updateCount();

  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    const overwrite = Boolean(item.fields.overwrite?.checked);
    if (item.inspection.existing && !overwrite) {
      skipped += 1;
      setState(item, "skipped", "检测到重复，未勾选覆盖，因此已跳过。 ");
      continue;
    }

    const title = item.fields.title.value.trim();
    const artists = splitLines(item.fields.artists.value);
    if (!title || !artists.length) {
      failed += 1;
      setState(item, "error", "歌曲名称和艺术家不能为空。 ");
      item.card.querySelector("details").open = true;
      continue;
    }

    setState(item, "saving", `正在写入 ${index + 1}/${candidates.length}`);
    saveButton.textContent = `正在写入 ${index + 1}/${candidates.length}`;
    message(`正在写入：${title}`);
    try {
      const result = await request("/api/save", {
        filename: item.file.name,
        content: item.content,
        id: item.inspection.id,
        title,
        artists,
        albums: splitLines(item.fields.albums.value),
        language: item.fields.language.value.trim(),
        license: item.fields.license.value.trim(),
        sourceUrl: item.fields.sourceUrl.value.trim(),
        overwrite,
      });
      saved += 1;
      setState(item, "saved", `${result.overwritten ? "已更新" : "已写入"}：${result.path}`);
    } catch (error) {
      failed += 1;
      setState(item, error.status === 409 ? "duplicate" : "error", error.message);
      item.card.querySelector("details").open = true;
    }
  }

  busy = false;
  saveButton.textContent = "全部写入歌词库";
  updateCount();
  const summary = `批量处理完成：写入 ${saved} 个，跳过 ${skipped} 个，失败 ${failed} 个。`;
  message(summary + (saved ? " 现在可以一次提交并推送。" : ""), failed ? "error" : "success");
}

input.addEventListener("change", () => {
  const files = input.files;
  void addFiles(files);
  input.value = "";
});

addFilesButton.addEventListener("click", () => input.click());
saveButton.addEventListener("click", () => void saveAll());

for (const event of ["dragenter", "dragover"]) {
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.add("dragging");
  });
}
for (const event of ["dragleave", "drop"]) {
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.remove("dragging");
  });
}
drop.addEventListener("drop", (event) => void addFiles(event.dataTransfer.files));

publishButton.addEventListener("click", async () => {
  if (!confirm("确定将本次批量写入的歌词生成一次提交，并推送到 GitHub 吗？")) return;
  busy = true;
  updateCount();
  message("正在提交并推送到 GitHub…");
  try {
    const result = await request("/api/publish");
    for (const item of items.filter((entry) => entry.state === "saved")) {
      setState(item, "published", "已提交并推送到 GitHub。 ");
    }
    message(result.message, "success");
  } catch (error) {
    message(`推送失败：${error.message}`, "error");
  } finally {
    busy = false;
    updateCount();
  }
});
