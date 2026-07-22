# TTML Hub

一个部署在 GitHub Pages 的开放 TTML 歌词仓库。TTML 文件进入 `lyrics/` 后，系统自动校验、生成搜索索引和更新清单并发布网页。

## 本地拖放上传

```bash
npm install
npm run upload
```

打开终端显示的本机地址，把 TTML 文件拖入网页。上传页会读取 AMLL 头部中的：

- `musicName`：歌曲名称
- 所有 `artists`：全部艺术家，不区分主次
- 所有 `album`：多个专辑别名
- `qqMusicId`、`ncmMusicId`、`appleMusicId` 等平台 ID
- TTML 作者与语言

确认后点击“写入本地歌词库”，再点击“提交并推送 GitHub”。本地服务只绑定 `127.0.0.1`，不会向局域网或互联网开放。

## 存储规则

```text
lyrics/<ID前2位>/<16位稳定ID>.ttml
lyrics/<ID前2位>/<16位稳定ID>.meta.json
```

例如：`lyrics/7c/7c9f0a4e32b6d118.ttml`。路径与艺术家无关，适合合唱、feat. 和不同演出版。平台 ID 用于稳定命名和重复检测；全部可搜索信息保存在元数据及生成的索引中。

## 客户端接入

- `/api/v1/manifest.json`：小型更新清单，包含 `revision`、歌词数量和索引地址。
- `/api/v1/songs.json`：按歌名、任意艺术家、专辑和别名搜索的完整索引。
- `/lyrics/.../*.ttml`：原始歌词文件。

推荐每 6 小时请求一次 manifest 并使用 `If-None-Match`。收到 `304` 或 revision 未变化时停止；revision 变化时再刷新 songs.json。结果中的 `path` 是 TTML 下载地址，`sha256` 用于校验缓存。

## 发布到 GitHub Pages

仓库 Settings → Pages 的 Source 选择 **GitHub Actions**。推送到 `main` 后，`Validate and deploy` 会自动校验并发布；Pull Request 只校验、不发布。

## 关于公开上传页

GitHub Pages 是静态托管，不能直接写仓库。其他人可以克隆或 Fork 本项目后运行 `npm run upload`，把歌词写进自己的仓库，再向你的仓库发 Pull Request。不要把 GitHub Token 写进网页代码。

软件代码采用 MIT License；每份歌词仍遵循其元数据声明的授权，公开仓库不会自动取得歌词版权。
