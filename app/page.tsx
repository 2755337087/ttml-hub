import type { Metadata } from "next";
import { LunaBeatDownload } from "./lunabeat-download";
import { LyricsSearch } from "./lyrics-search";

export const metadata: Metadata = {
  title: "TTML Hub · 搜索歌词",
  description: "按歌曲名称或艺术家搜索并下载 TTML 歌词。",
};

export default function Home() {
  return (
    <main className="search-page">
      <header className="search-header">
        <div className="brand" aria-label="TTML Hub">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>TTML Hub</span>
        </div>
        <span className="catalog-label">OPEN TTML CATALOG</span>
      </header>

      <section className="search-content">
        <LunaBeatDownload />
        <div className="search-intro">
          <h1>搜索歌词</h1>
          <p>输入歌曲名称、任意一位艺术家或专辑名称。</p>
        </div>
        <LyricsSearch />
      </section>
    </main>
  );
}
