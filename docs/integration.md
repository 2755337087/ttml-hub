# TTML Hub 接入指南

TTML Hub 通过静态 JSON 文件发布歌词目录。客户端应把目录下载到本地缓存，使用 Apple Music ID 优先匹配歌词，只有没有平台 ID 时才以标题、艺术家和专辑作候选匹配。

## 公共地址

以生产站点为例：

```text
https://2755337087.github.io/ttml-hub/api/v1/manifest.json
https://2755337087.github.io/ttml-hub/api/v1/songs.json
```

每首歌的 TTML 下载地址由 `BASE_URL + song.path` 得到。例如 `path` 为 `lyrics/29/29342efe915ae20f.ttml` 时：

```text
https://2755337087.github.io/ttml-hub/lyrics/29/29342efe915ae20f.ttml
```

## 刷新索引

1. 启动时立即读取本地缓存，保证离线可搜索。
2. 按应用策略请求 `manifest.json`。推荐间隔为 6 小时，或在用户手动刷新时强制检查。
3. 携带上次响应的 ETag 作为 `If-None-Match`。若服务返回 `304`，继续使用缓存。
4. 若响应中的 `revision` 未变，更新检查时间即可。
5. 若 `revision` 改变，下载 `manifest.index` 指向的索引文件，校验索引的 `revision` 与 manifest 一致。建议额外核对 `indexSha256`。
6. 校验通过后再原子替换本地缓存。

`revision` 是歌曲元数据和歌词内容哈希计算出的目录版本；`generatedAt` 仅代表构建时间，不能作为刷新判断依据。

## 索引格式

当前接口为 `schemaVersion: 2`。`sourceIds` 的每个值都是字符串数组，即使只有一个 ID：

```json
{
  "schemaVersion": 2,
  "revision": "28e4103a07d9838f15b2",
  "songs": [
    {
      "id": "29342efe915ae20f",
      "title": "年少有为",
      "artists": ["李荣浩"],
      "album": "耳朵",
      "albums": ["耳朵", "年少有为 - Single"],
      "sourceIds": {
        "appleMusicId": ["1411387590", "1438536444"],
        "qqMusicId": ["004DXFlC0nsTCZ"],
        "ncmMusicId": ["1293886117"]
      },
      "path": "lyrics/29/29342efe915ae20f.ttml",
      "sha256": "..."
    }
  ]
}
```

`id` 是 TTML Hub 的稳定歌词 ID，不是平台曲目 ID。`sha256` 为 TTML 文件原始字节的 SHA-256；下载歌词后应校验它。

## 匹配规则

### Apple Music ID

把 Apple Music ID 作为字符串，不要转换为数字。建立本地反向索引：

```text
appleMusicId -> Song
```

遍历每首歌的 `sourceIds.appleMusicId` 数组，将其中每个 ID 都映射到该歌曲。一份歌词可以关联多个 Apple Music ID，例如单曲版、专辑版或不同发行版；一个 Apple Music ID 在整个目录中只会归属一份歌词。

伪代码：

```ts
const byAppleMusicId = new Map<string, Song>();

for (const song of index.songs) {
  for (const appleMusicId of song.sourceIds?.appleMusicId ?? []) {
    byAppleMusicId.set(appleMusicId, song);
  }
}

const song = byAppleMusicId.get(currentTrack.appleMusicId);
```

命中后直接使用该歌词，不应再被标题或专辑差异否决。

### 标题、艺术家和专辑兜底

当播放来源没有 Apple Music ID 或其他可靠平台 ID 时，才进行文本候选匹配：

1. 对输入和索引字段统一 NFKC、转小写并删除空白、`·`、`・`、`.`、`_`、`-`。
2. 标题与艺术家是主要条件，所有查询词允许分散命中这两个字段。
3. `aliases` 可作为标题别名；`album` 和 `albums` 只用于提高置信度或消歧。
4. 同名、Live、Remaster、伴奏、翻唱等情况不要自动覆盖已有的精确 ID 匹配；多个候选时应交由用户选择或保留为空。

TTML Hub 网站和 Android 示例均提供本地文本搜索。Android 可直接使用：

```kotlin
val song = ttmlHub.findByAppleMusicId(appleMusicId)
    ?: ttmlHub.search("$title $artist").firstOrNull()
```

在兜底路径中，应用应自行判断候选是否足够可信，不能把搜索结果的第一项视作确定匹配。

## 兼容与迁移

`schemaVersion: 1` 的旧索引将 `sourceIds.appleMusicId` 表示为单个字符串。接入 schema v2 时应读取数组；若需要同时支持已缓存的旧索引，可将单字符串包装为单元素数组。

```ts
function sourceIdValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return typeof value === "string" && value.length > 0 ? [value] : [];
}
```

索引的 `schemaVersion` 发生不兼容升级时，客户端应丢弃不能解析的本地缓存并完整重新下载，而不是继续使用旧结构。

## 维护歌词元数据

在 TTML 的 `<metadata>` 中，为同一份歌词重复添加 Apple Music ID：

```xml
<amll:meta key="appleMusicId" value="1411387590"/>
<amll:meta key="appleMusicId" value="1438536444"/>
```

使用 `npm run upload` 保存时，全部 ID 会写入同名 `.meta.json` 的 `sourceIds.appleMusicId` 数组。手动编辑时也应同步更新 sidecar；构建器以 sidecar 作为发布索引的规范来源，并会拒绝跨歌词文件的重复平台 ID。
