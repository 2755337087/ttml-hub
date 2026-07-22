# TTML Hub

一个适合部署到 GitHub Pages 的开放 TTML 歌词仓库：歌词文件进入 `lyrics/` 后，系统会自动校验、生成搜索索引和更新清单，并发布网页。

## 推荐命名

```text
lyrics/<主艺术家>/<歌名> [<8位稳定ID>].ttml
```

例如：`lyrics/周杰伦/晴天 [a1b2c3d4].ttml`

请用创建命令生成随机 ID，不要把内容哈希当成 ID，因为歌词修正后内容哈希会变化。

```bash
npm install
npm run lyric:new -- --title "晴天" --artist "周杰伦"
npm run lyrics:check
npm run dev
```

## 客户端接入

部署后提供三个静态地址：

- `/api/v1/manifest.json`：很小的更新清单，包含 `revision`、歌词数量和索引地址。
- `/api/v1/songs.json`：按歌名、艺术家、专辑和别名搜索的完整索引。
- `/lyrics/.../*.ttml`：原始歌词文件。

推荐每 6 小时请求一次 manifest，并使用 `If-None-Match`。收到 `304` 或 revision 未变化时不做任何事；revision 变化时再刷新 songs.json。搜索结果中的 `path` 就是歌词下载地址，`sha256` 可用于校验本地缓存。

## 发布到 GitHub Pages

1. 新建公开 GitHub 仓库，把本项目推送到 `main` 分支。
2. 打开仓库 Settings → Pages。
3. 在 Build and deployment 中选择 **GitHub Actions**。
4. 推送歌词或代码后，`Validate and deploy` 工作流会自动校验并发布。

Pull Request 只做校验，不会发布；合并到 `main` 后才会更新线上索引。

## 数据结构

可选的同名 `.meta.json`：

```json
{
  "title": "晴天",
  "artists": ["周杰伦"],
  "album": "叶惠美",
  "language": "zh-Hans",
  "aliases": ["Sunny Day"],
  "isrc": "",
  "license": "",
  "sourceUrl": ""
}
```

没有元数据时，系统会从目录名和文件名推断歌名与主艺术家。软件代码采用 MIT License；每份歌词仍遵循其元数据声明的授权，公开仓库不会自动取得歌词版权。
