"use client";

import { useEffect, useMemo, useState } from "react";

type Song = {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  language?: string;
  aliases?: string[];
  path: string;
  sha256: string;
};

type SongIndex = {
  revision: string;
  songs: Song[];
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s·・._-]+/g, "");
}

export function LyricsSearch() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${basePath}/api/v1/songs.json`)
      .then((response) => {
        if (!response.ok) throw new Error("index unavailable");
        return response.json() as Promise<SongIndex>;
      })
      .then((index) => active && setSongs(index.songs))
      .catch(() => active && setError(true))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return songs.slice(0, 6);
    return songs.filter((song) => {
      const haystack = [song.title, ...song.artists, ...(song.aliases ?? []), song.album ?? ""]
        .map(normalize)
        .join(" ");
      return haystack.includes(needle);
    }).slice(0, 12);
  }, [query, songs]);

  return (
    <div className="search-shell">
      <label className="search-box">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索歌名或艺术家…"
          aria-label="搜索歌名或艺术家"
        />
        <kbd>⌘ K</kbd>
      </label>
      <div className="search-meta">
        <span>{loading ? "正在读取索引…" : error ? "暂时无法读取索引" : `${songs.length} 首歌词可搜索`}</span>
        {query && !loading && <span>找到 {results.length} 个结果</span>}
      </div>
      <div className="results" aria-live="polite">
        {!loading && !error && results.map((song) => (
          <a className="song-row" href={`${basePath}/${song.path}`} key={song.id} download>
            <span className="song-index">{song.id.slice(0, 2).toUpperCase()}</span>
            <span className="song-main"><b>{song.title}</b><small>{song.artists.join(" / ")}{song.album ? ` · ${song.album}` : ""}</small></span>
            <span className="song-language">{song.language ?? "und"}</span>
            <span className="song-action">下载 TTML <b>↓</b></span>
          </a>
        ))}
        {!loading && !error && query && results.length === 0 && (
          <div className="empty-state">没有找到匹配歌词。可以换个写法，或提交一份新歌词。</div>
        )}
      </div>
    </div>
  );
}
