import type { Metadata } from "next";
import { LunaBeatDownload } from "./lunabeat-download";
import { LyricsSearch } from "./lyrics-search";

export const metadata: Metadata = {
  title: "LunaBeat TTML 歌词站 · 搜索歌词",
  description: "按歌曲名称、艺术家或专辑搜索并下载 TTML 歌词。",
};

export default function Home() {
  return (
    <main className="search-page">
      <header className="search-header">
        <div className="brand" aria-label="LunaBeat TTML 歌词站">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>LunaBeat TTML 歌词站</span>
        </div>
        <span className="catalog-label">OPEN TTML CATALOG</span>
      </header>

      <section className="search-content">
        <LunaBeatDownload />
        <div className="search-intro">
          <div className="search-intro-head">
            <h1>搜索歌词</h1>
            <div className="search-actions">
              <a
                className="feedback-link"
                href="https://github.com/2755337087/ttml-hub/issues/new?template=lyric-request.yml"
                target="_blank"
                rel="noreferrer"
              >
                提交歌词
                <span aria-hidden="true">↗</span>
              </a>
              <a
                className="feedback-link"
                href="https://github.com/2755337087/ttml-hub/issues/new?template=lyric-feedback.yml"
                target="_blank"
                rel="noreferrer"
              >
                反馈歌词错误
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
          <p>输入歌曲名称、任意一位艺术家或专辑名称。</p>
        </div>
        <LyricsSearch />
      </section>
    </main>
  );
}
