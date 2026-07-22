"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Song = {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  albums?: string[];
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
  const inputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return songs.slice(0, 8);
    return songs.filter((song) => {
      const haystack = [song.title, ...song.artists, ...(song.aliases ?? []), ...(song.albums ?? (song.album ? [song.album] : []))]
        .map(normalize)
        .join(" ");
      return haystack.includes(needle);
    }).slice(0, 20);
  }, [query, songs]);

  return (
    <div className="search-shell">
      <label className="search-box">
        <span className="search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索歌名或艺术家…"
          aria-label="搜索歌名或艺术家"
          autoFocus
        />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="清空搜索">清除</button> : <kbd>⌘ K</kbd>}
      </label>
      <div className="search-meta">
        <span>{loading ? "正在读取歌词库…" : error ? "歌词库暂时不可用" : `${songs.length} 首歌词`}</span>
        {query && !loading && !error && <span>{results.length} 个结果</span>}
      </div>
      <div className="results" aria-live="polite">
        {!loading && !error && results.map((song) => (
          <a className="song-row" href={`${basePath}/${song.path}`} key={song.id} download>
            <span className="song-main">
              <b>{song.title}</b>
              <small>{song.artists.join(" / ")}{song.album ? ` · ${song.album}` : ""}</small>
            </span>
            <span className="song-action"><span>TTML</span><b aria-hidden="true">↓</b></span>
          </a>
        ))}
        {!loading && !error && query && results.length === 0 && (
          <div className="empty-state">没有找到匹配的歌词</div>
        )}
      </div>
    </div>
  );
}
