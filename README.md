# LunaBeat TTML 歌词站

LunaBeat TTML 歌词站是一个面向 LunaBeat 及其他播放器的开放歌词目录，收集并发布可下载的 TTML 歌词，支持按歌曲名称、艺术家或专辑搜索。

[搜索并下载 TTML 歌词](https://2755337087.github.io/ttml-hub/)

## 项目特点

- 静态发布，直接下载 TTML 歌词文件。
- 使用稳定歌词 ID 和 SHA-256 校验，便于本地缓存与增量更新。
- 支持一份歌词关联多个 Apple Music ID。
- 提供公开 JSON 索引，方便播放器和歌词工具接入。

## 接口与多平台 ID

其他项目可先请求 `api/v1/manifest.json`，仅当其中的 `revision` 变化时再下载 `api/v1/songs.json`。索引当前为 `schemaVersion: 2`；每首歌的 `sourceIds` 使用数组，方便一份歌词关联同一平台的多个版本：

```json
"sourceIds": {
  "appleMusicId": ["1813826436", "1813826999"]
}
```

Apple Music ID 必须按字符串比较。TTML 文件中可重复写入 `<amll:meta key="appleMusicId" value="..."/>`；使用入库工具保存时，全部值会同步写入同名 `.meta.json`，再进入索引。单值的旧 `.meta.json` 仍然兼容，但新写入的索引一律输出数组。

完整的刷新、匹配与迁移说明见[接入指南](docs/integration.md)。

## 相关项目

配套播放器与歌词编辑器：[2755337087/LunaBeat](https://github.com/2755337087/LunaBeat)
