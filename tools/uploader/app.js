const drop = document.querySelector("#drop-zone");
const input = document.querySelector("#file-input");
const editor = document.querySelector("#editor");
const notice = document.querySelector("#notice");
const duplicate = document.querySelector("#duplicate");
const saveButton = document.querySelector("#save-button");
const publishButton = document.querySelector("#publish-button");
let currentFile = null;
let content = "";
let inspection = null;
let allowOverwrite = false;

function message(text, type = "") {
  notice.textContent = text;
  notice.className = type;
}

function lines(id) {
  return document.querySelector(id).value.split("\n").map((value) => value.trim()).filter(Boolean);
}

async function request(path, body = {}) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "请求失败");
    error.status = response.status;
    error.result = result;
    throw error;
  }
  return result;
}

async function loadFile(file) {
  if (!file?.name.toLowerCase().endsWith(".ttml")) return message("请选择 .ttml 文件", "error");
  try {
    message("正在读取 TTML 头部…");
    currentFile = file;
    content = await file.text();
    inspection = await request("/api/inspect", { content });
    allowOverwrite = false;
    saveButton.textContent = "写入本地歌词库";
    document.querySelector("#file-name").textContent = file.name;
    document.querySelector("#title").value = inspection.title;
    document.querySelector("#artists").value = inspection.artists.join("\n");
    document.querySelector("#albums").value = inspection.albums.join("\n");
    document.querySelector("#language").value = inspection.language;
    document.querySelector("#target-path").textContent = inspection.suggestedPath;
    document.querySelector("#source-ids").textContent = Object.entries(inspection.sourceIds).map(([key, value]) => `${key}: ${value}`).join(" · ") || "未检测到，将生成随机稳定 ID";
    duplicate.hidden = !inspection.existing;
    duplicate.textContent = inspection.existing ? `检测到已有歌词：${inspection.existing.title}（${inspection.existing.path}）。再次保存时将要求你确认覆盖。` : "";
    editor.hidden = false;
    drop.hidden = true;
    publishButton.disabled = true;
    message(inspection.missing.length ? `头部缺少：${inspection.missing.join("、")}，请补充后再保存。` : "元数据读取完成，请确认后写入。", inspection.missing.length ? "error" : "success");
  } catch (error) {
    message(error.message, "error");
  }
}

input.addEventListener("change", () => loadFile(input.files[0]));
for (const event of ["dragenter", "dragover"]) drop.addEventListener(event, (e) => { e.preventDefault(); drop.classList.add("dragging"); });
for (const event of ["dragleave", "drop"]) drop.addEventListener(event, (e) => { e.preventDefault(); drop.classList.remove("dragging"); });
drop.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));
document.querySelector("#change-file").addEventListener("click", () => { editor.hidden = true; drop.hidden = false; input.value = ""; message("等待选择 TTML 文件"); });

editor.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  try {
    const result = await request("/api/save", {
      filename: currentFile.name,
      content,
      title: document.querySelector("#title").value,
      artists: lines("#artists"),
      albums: lines("#albums"),
      language: document.querySelector("#language").value,
      license: document.querySelector("#license").value,
      sourceUrl: document.querySelector("#source-url").value,
      overwrite: allowOverwrite,
    });
    allowOverwrite = false;
    saveButton.textContent = "写入本地歌词库";
    publishButton.disabled = false;
    duplicate.hidden = true;
    message(`${result.overwritten ? "已更新" : "已写入"}：${result.path}`, "success");
  } catch (error) {
    if (error.status === 409) {
      allowOverwrite = true;
      duplicate.hidden = false;
      duplicate.textContent = `${error.message}。如确定要更新它，请再次点击“覆盖已有歌词”。`;
      saveButton.textContent = "覆盖已有歌词";
    }
    message(error.message, "error");
  } finally {
    saveButton.disabled = false;
  }
});

publishButton.addEventListener("click", async () => {
  if (!confirm("确定将本次保存的歌词提交并推送到 GitHub 吗？")) return;
  publishButton.disabled = true;
  try {
    const result = await request("/api/publish");
    message(result.message, "success");
  } catch (error) {
    publishButton.disabled = false;
    message(`推送失败：${error.message}`, "error");
  }
});
