package com.example.app.lyrics

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale

data class TtmlHubSong(
    val id: String,
    val title: String,
    val artists: List<String>,
    val album: String?,
    val albums: List<String>,
    val aliases: List<String>,
    val language: String?,
    val hasTranslation: Boolean,
    val hasTransliteration: Boolean,
    val path: String,
    val sha256: String,
)

/**
 * TTML Hub 的 Android 客户端示例。
 *
 * 搜索完全在手机本地完成。默认最多每 6 小时请求一次 manifest，只有 revision
 * 变化时才重新下载 songs.json。请把包名改成你自己项目的包名。
 */
class TtmlHubClient(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val indexFile = File(appContext.filesDir, INDEX_FILE_NAME)

    @Volatile
    private var memorySongs: List<TtmlHubSong>? = null

    /**
     * 在 Application、ViewModel 或后台任务中调用。
     * @return true 表示已下载并写入新版索引；false 表示本地索引仍是最新版。
     */
    suspend fun syncIfNeeded(force: Boolean = false): Boolean = withContext(Dispatchers.IO) {
        syncBlocking(force)
    }

    /** 使用已经缓存到手机的索引搜索，不会发起网络请求。 */
    fun search(query: String, limit: Int = 20): List<TtmlHubSong> {
        val songs = loadCachedSongs()
        val terms = query.trim()
            .split(Regex("\\s+"))
            .map(::normalize)
            .filter(String::isNotEmpty)
        if (terms.isEmpty()) return songs.take(limit)

        return songs.asSequence()
            .filter { song ->
                val fields = (
                    sequenceOf(song.title) +
                        song.artists.asSequence() +
                        song.aliases.asSequence() +
                        song.albums.asSequence() +
                        listOfNotNull(song.album).asSequence()
                    ).map(::normalize).toList()
                terms.all { term -> fields.any { field -> field.contains(term) } }
            }
            .take(limit)
            .toList()
    }

    /** 下载一份 TTML，并使用索引中的 SHA-256 校验内容。 */
    suspend fun downloadLyric(song: TtmlHubSong): ByteArray = withContext(Dispatchers.IO) {
        val lyricUrl = URI(BASE_URL).resolve(song.path).toString()
        val response = get(lyricUrl)
        if (response.status !in 200..299) throw IOException("歌词下载失败：HTTP ${response.status}")

        val actualHash = sha256(response.body)
        if (!actualHash.equals(song.sha256, ignoreCase = true)) {
            throw IOException("歌词校验失败：${song.title}")
        }
        response.body
    }

    fun cachedSongCount(): Int = loadCachedSongs().size

    @Synchronized
    private fun syncBlocking(force: Boolean): Boolean {
        val now = System.currentTimeMillis()
        val lastCheck = preferences.getLong(KEY_LAST_CHECK, 0L)
        val diskIndex = loadSongsFromDisk()
        if (!force && diskIndex != null && now - lastCheck < CHECK_INTERVAL_MS) {
            memorySongs = diskIndex.songs
            return false
        }

        val oldEtag = preferences.getString(KEY_MANIFEST_ETAG, null)
            ?.takeIf { diskIndex != null }
        val manifestResponse = get(MANIFEST_URL, oldEtag)
        if (manifestResponse.status == HttpURLConnection.HTTP_NOT_MODIFIED) {
            preferences.edit().putLong(KEY_LAST_CHECK, now).apply()
            memorySongs = diskIndex?.songs.orEmpty()
            return false
        }
        if (manifestResponse.status !in 200..299) {
            throw IOException("更新清单请求失败：HTTP ${manifestResponse.status}")
        }

        val manifest = JSONObject(manifestResponse.body.toString(Charsets.UTF_8))
        val revision = manifest.getString("revision")
        val oldRevision = preferences.getString(KEY_REVISION, null)
        if (revision == oldRevision && diskIndex != null) {
            memorySongs = diskIndex.songs
            preferences.edit()
                .putLong(KEY_LAST_CHECK, now)
                .putString(KEY_MANIFEST_ETAG, manifestResponse.etag)
                .apply()
            return false
        }

        val indexName = manifest.optString("index", "songs.json")
        val indexUrl = URI(MANIFEST_URL).resolve(indexName).toString()
        val indexResponse = get(indexUrl)
        if (indexResponse.status !in 200..299) {
            throw IOException("歌曲索引请求失败：HTTP ${indexResponse.status}")
        }

        val indexText = indexResponse.body.toString(Charsets.UTF_8)
        val parsed = parseIndex(indexText)
        if (parsed.revision != revision) throw IOException("更新清单与歌曲索引版本不一致")

        indexFile.writeText(indexText, Charsets.UTF_8)
        memorySongs = parsed.songs
        preferences.edit()
            .putString(KEY_REVISION, revision)
            .putString(KEY_MANIFEST_ETAG, manifestResponse.etag)
            .putLong(KEY_LAST_CHECK, now)
            .apply()
        return true
    }

    private fun loadCachedSongs(): List<TtmlHubSong> {
        memorySongs?.let { return it }
        val songs = loadSongsFromDisk()?.songs.orEmpty()
        memorySongs = songs
        return songs
    }

    private fun loadSongsFromDisk(): ParsedIndex? {
        if (!indexFile.exists()) return null
        return runCatching { parseIndex(indexFile.readText(Charsets.UTF_8)) }.getOrNull()
    }

    private fun parseIndex(text: String): ParsedIndex {
        val root = JSONObject(text)
        val array = root.getJSONArray("songs")
        val songs = ArrayList<TtmlHubSong>(array.length())
        for (index in 0 until array.length()) {
            val item = array.getJSONObject(index)
            songs += TtmlHubSong(
                id = item.getString("id"),
                title = item.getString("title"),
                artists = item.getJSONArray("artists").toStringList(),
                album = item.optNullableString("album"),
                albums = item.optJSONArray("albums")?.toStringList().orEmpty(),
                aliases = item.optJSONArray("aliases")?.toStringList().orEmpty(),
                language = item.optNullableString("language"),
                hasTranslation = item.optBoolean("hasTranslation", false),
                hasTransliteration = item.optBoolean("hasTransliteration", false),
                path = item.getString("path"),
                sha256 = item.getString("sha256"),
            )
        }
        return ParsedIndex(root.getString("revision"), songs)
    }

    private fun get(url: String, etag: String? = null): HttpResponse {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.requestMethod = "GET"
        connection.connectTimeout = 10_000
        connection.readTimeout = 20_000
        connection.setRequestProperty("Accept", "application/json, application/ttml+xml, application/xml, text/xml, */*")
        connection.setRequestProperty("User-Agent", "TTML-Hub-Android/1.0")
        if (!etag.isNullOrBlank()) connection.setRequestProperty("If-None-Match", etag)

        return try {
            val status = connection.responseCode
            val body = if (status == HttpURLConnection.HTTP_NOT_MODIFIED) {
                ByteArray(0)
            } else {
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                stream?.use { it.readBytes() } ?: ByteArray(0)
            }
            HttpResponse(status, body, connection.getHeaderField("ETag"))
        } finally {
            connection.disconnect()
        }
    }

    private data class ParsedIndex(val revision: String, val songs: List<TtmlHubSong>)
    private data class HttpResponse(val status: Int, val body: ByteArray, val etag: String?)

    companion object {
        const val BASE_URL = "https://2755337087.github.io/ttml-hub/"
        const val MANIFEST_URL = "${BASE_URL}api/v1/manifest.json"

        private const val CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L
        private const val PREFERENCES_NAME = "ttml_hub"
        private const val INDEX_FILE_NAME = "ttml_hub_songs.json"
        private const val KEY_REVISION = "revision"
        private const val KEY_MANIFEST_ETAG = "manifest_etag"
        private const val KEY_LAST_CHECK = "last_check"
    }
}

private fun normalize(value: String): String = Normalizer
    .normalize(value, Normalizer.Form.NFKC)
    .lowercase(Locale.ROOT)
    .replace(Regex("[\\s·・._-]+"), "")

private fun JSONArray.toStringList(): List<String> =
    (0 until length()).map { getString(it) }

private fun JSONObject.optNullableString(key: String): String? =
    if (has(key) && !isNull(key)) getString(key) else null

private fun sha256(bytes: ByteArray): String = MessageDigest
    .getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { "%02x".format(it.toInt() and 0xff) }
