# 歌词目录与上传规范

歌词不按艺术家分类。路径只由稳定 ID 决定：

```text
lyrics/<ID前2位>/<16位稳定ID>.ttml
lyrics/<ID前2位>/<16位稳定ID>.meta.json
```

例如：`lyrics/7c/7c9f0a4e32b6d118.ttml`

- `.ttml` 保存原始歌词，不改写内容。
- 同名 `.meta.json` 保存歌曲名称、所有艺术家、多个专辑、语言、平台 ID 和授权来源。
- 有 Apple Music、QQ 音乐或网易云 ID 时，系统据此生成稳定内部 ID；没有时生成随机 16 位 ID。
- 艺术家是数组，没有“主艺术家”，因此适合合唱、feat.、组合或不同演出版。
- 同一平台 ID 再次上传会被识别为更新，覆盖前必须确认。

## 最方便：本地拖放上传

```bash
npm run upload
```

浏览器打开终端显示的 `http://127.0.0.1:4173`，把 TTML 拖入页面。确认自动读取的信息后：

1. 点击“写入本地歌词库”。
2. 点击“提交并推送 GitHub”。
3. GitHub Actions 会自动校验、更新索引并部署网站。

该服务只监听本机地址；网页中的写入和 Git 推送功能不会出现在 GitHub Pages 上。

## 命令行导入现有文件

```bash
npm run lyric:add -- --file "/路径/歌曲.ttml" --title "歌名" --artists "艺术家甲,艺术家乙"
```

公开仓库不等于歌词自动获得开放授权。请只提交你有权分享的内容，并填写 `license` 和 `sourceUrl`。
