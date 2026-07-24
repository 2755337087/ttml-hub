"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchSongs } from "./search-utils";

type Song = {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  albums?: string[];
  language?: string;
  aliases?: string[];
  hasTranslation: boolean;
  hasTransliteration: boolean;
  path: string;
  sha256: string;
};

type SongIndex = {
  revision: string;
  songs: Song[];
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const PAGE_SIZE = 10;

const LANGUAGE_NAMES: Record<string, string> = {
  "zh-Hans": "简体中文",
  "zh-Hant": "繁体中文",
  en: "英语",
  ja: "日语",
  ko: "韩语",
  ru: "俄语",
  tr: "土耳其语",
  id: "印尼语",
  vi: "越南语",
  th: "泰语",
  es: "西班牙语",
  hi: "印地语",
  pt: "葡萄牙语",
  fr: "法语",
  de: "德语",
  und: "语言未知",
};

function languageName(language?: string) {
  if (!language) return "语言未知";
  return LANGUAGE_NAMES[language] ?? language;
}

export function LyricsSearch() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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
    if (!query.trim()) return songs;
    return searchSongs(songs, query, songs.length);
  }, [query, songs]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageResults = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <div className="search-shell">
      <label className="search-box">
        <span className="search-icon" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="搜索歌名或艺术家…"
          aria-label="搜索歌名或艺术家"
          autoFocus
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPage(1);
            }}
            aria-label="清空搜索"
          >
            清除
          </button>
        ) : <kbd>⌘ K</kbd>}
      </label>
      <div className="search-meta">
        <span>{loading ? "正在读取歌词库…" : error ? "歌词库暂时不可用" : `${songs.length} 首歌词`}</span>
        {!loading && !error && <span>{results.length} 个结果</span>}
      </div>
      <div className="results" ref={resultsRef} aria-live="polite">
        {!loading && !error && pageResults.map((song) => (
          <a className="song-row" href={`${basePath}/${song.path}`} key={song.id} download>
            <span className="song-main">
              <b>{song.title}</b>
              <small className="song-credit">{song.artists.join(" / ")}{song.album ? ` · ${song.album}` : ""}</small>
              <span className="song-features" aria-label="歌词信息">
                <span className="song-feature song-language">{languageName(song.language)}</span>
                <span className="song-feature" data-active={song.hasTranslation}>
                  {song.hasTranslation ? "有翻译" : "无翻译"}
                </span>
                <span className="song-feature" data-active={song.hasTransliteration}>
                  {song.hasTransliteration ? "有注音" : "无注音"}
                </span>
              </span>
            </span>
            <span className="song-action"><span>TTML</span><b aria-hidden="true">↓</b></span>
          </a>
        ))}
        {!loading && !error && query && results.length === 0 && (
          <div className="empty-state">没有找到匹配的歌词</div>
        )}
      </div>
      {!loading && !error && results.length > PAGE_SIZE && (
        <nav className="pagination" aria-label="歌词搜索结果分页">
          <button
            type="button"
            onClick={() => changePage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ← 上一页
          </button>
          <span className="page-status" aria-label={`第 ${currentPage} 页，共 ${totalPages} 页`}>
            <b>{currentPage}</b>
            <span>/</span>
            {totalPages}
          </span>
          <button
            type="button"
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            下一页 →
          </button>
        </nav>
      )}
    </div>
  );
}
