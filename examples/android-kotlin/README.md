# Android Kotlin 接入示例

这个示例使用 TTML Hub 的公开静态接口：

```text
https://2755337087.github.io/ttml-hub/api/v1/manifest.json
https://2755337087.github.io/ttml-hub/api/v1/songs.json
https://2755337087.github.io/ttml-hub/<歌曲 path>
```

搜索在 Android 设备本地完成。客户端最多每 6 小时检查一次很小的 `manifest.json`，只有 `revision` 变化时才重新下载 `songs.json`，因此不会在用户每次输入关键词时请求 GitHub。

## 1. 加入网络权限

在 `AndroidManifest.xml` 的 `<application>` 外加入：

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

## 2. 复制客户端

把以下文件复制到你的 Android 项目，并把第一行包名改成你的包名：

- `TtmlHubClient.kt`：更新索引、本地搜索、下载和校验 TTML。
- `TtmlHubSyncWorker.kt`：可选，每 6 小时在后台检查更新。

客户端使用 Kotlin 协程；后台定时任务使用 AndroidX WorkManager。请使用你项目当前的稳定版依赖：

```kotlin
dependencies {
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.work.runtime.ktx)
}
```

如果项目没有使用 Gradle Version Catalog，把它们替换成项目采用的完整 Maven 坐标和版本即可。如果暂时不需要后台定时检查，可以不复制 Worker，也不添加 WorkManager。

## 3. 首次同步和搜索

在 ViewModel 的协程中先同步，然后搜索：

```kotlin
private val ttmlHub = TtmlHubClient(application)

fun refreshAndSearch(keyword: String) = viewModelScope.launch {
    runCatching { ttmlHub.syncIfNeeded() }
        .onFailure { error ->
            // 网络失败时仍可继续使用以前缓存的索引。
            Log.w("TTMLHub", "索引更新失败", error)
        }

    val results = ttmlHub.search(keyword)
    // 把 results 交给 RecyclerView 或 Compose 列表。
}
```

`search()` 会匹配：

- 歌曲名称 `title`
- 所有艺术家 `artists`
- 别名 `aliases`
- 专辑名称 `album` 和 `albums`
- 歌词语言 `language`
- 是否有翻译 `hasTranslation`
- 是否有注音 `hasTransliteration`

搜索本身不会联网。

多个关键词会分别匹配不同字段，顺序不限。例如下面两种写法都会找到同一首歌：

```text
死ぬのがいいわ 藤井风
藤井风 死ぬのがいいわ
```

例如可以按语言和附加内容筛选：

```kotlin
val japaneseWithTranslation = ttmlHub.search(keyword).filter { song ->
    song.language == "ja" && song.hasTranslation
}
```

## 4. 下载歌词

用户选择歌曲后再下载对应 TTML：

```kotlin
fun download(song: TtmlHubSong) = viewModelScope.launch {
    runCatching { ttmlHub.downloadLyric(song) }
        .onSuccess { ttmlBytes ->
            val ttmlText = ttmlBytes.toString(Charsets.UTF_8)
            // 交给现有的 TTML 解析器，或者保存到应用缓存目录。
        }
        .onFailure { error ->
            Log.e("TTMLHub", "歌词下载失败", error)
        }
}
```

下载完成后会按照索引中的 `sha256` 自动校验，避免使用不完整或被意外修改的文件。

## 5. 开启后台更新

在你的 `Application.onCreate()` 中调度一次即可：

```kotlin
override fun onCreate() {
    super.onCreate()
    TtmlHubSyncWorker.schedule(this)
}
```

WorkManager 会保证同名任务只保留一份。系统可能根据电量和网络情况推迟执行，因此“每 6 小时”表示尽量执行，而不是精确到分钟。

## 推荐调用流程

```text
应用启动
  ├─ 立即读取手机里的旧索引，可马上搜索
  └─ 后台请求 manifest.json
       ├─ revision 未变化：停止
       └─ revision 已变化：下载并保存 songs.json

用户输入关键词 → 本地搜索 → 用户选择结果 → 下载一份 TTML
```

不要在用户每输入一个字时请求服务器，也不要每次启动都强制下载 `songs.json`。
