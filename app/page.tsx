import type { Metadata } from "next";
import { LyricsSearch } from "./lyrics-search";

export const metadata: Metadata = {
  title: "TTML Hub · 开放歌词索引",
  description: "为公开 TTML 歌词仓库提供自动索引、搜索与增量更新检测。",
};

const namingExample = "lyrics/周杰伦/晴天 [a1b2c3d4].ttml";

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="TTML Hub 首页">
          <span className="brand-mark" aria-hidden="true">T</span>
          <span>TTML Hub</span>
        </a>
        <nav aria-label="主导航">
          <a href="#search">搜索</a>
          <a href="#naming">规范</a>
          <a href="#api">接入</a>
        </nav>
        <a className="header-cta" href="#contribute">贡献歌词</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> OPEN LYRIC INFRASTRUCTURE</p>
          <h1>让每一句歌词，<br /><em>都能被找到。</em></h1>
          <p className="hero-lede">
            一个为软件而生的开放 TTML 歌词仓库。无需数据库：提交文件后自动校验、建立索引并发布，客户端只需按歌名或艺术家搜索。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#search">搜索歌词 <span>↗</span></a>
            <a className="button button-ghost" href="#api">查看接入方式</a>
          </div>
        </div>
        <div className="signal-card" aria-label="系统更新流程示意">
          <div className="signal-head">
            <span>LIVE INDEX</span>
            <span className="live"><i /> 自动更新</span>
          </div>
          <div className="wave" aria-hidden="true">
            {Array.from({ length: 28 }).map((_, index) => (
              <i key={index} style={{ height: `${18 + ((index * 17) % 68)}%` }} />
            ))}
          </div>
          <div className="signal-flow">
            <div><b>01</b><span>上传 TTML</span></div>
            <span>→</span>
            <div><b>02</b><span>生成索引</span></div>
            <span>→</span>
            <div><b>03</b><span>客户端发现</span></div>
          </div>
        </div>
      </section>

      <section className="search-section" id="search">
        <div className="section-heading">
          <p className="eyebrow"><span /> SEARCH THE CATALOG</p>
          <h2>歌名、艺术家，一次命中。</h2>
        </div>
        <LyricsSearch />
      </section>

      <section className="naming-section" id="naming">
        <div className="section-number">01 / FILE STANDARD</div>
        <div className="naming-copy">
          <p className="eyebrow"><span /> RECOMMENDED NAMING</p>
          <h2>看得懂的路径，<br />不会变的身份。</h2>
          <p>
            使用主艺术家做目录，歌名保持原语言；末尾加入创建时生成的 8 位稳定 ID。修改歌词时不要更换 ID，它是软件识别同一首歌的依据。
          </p>
          <code className="path-example">{namingExample}</code>
        </div>
        <div className="rule-list">
          <article><b>01</b><div><h3>保留 Unicode</h3><p>中文、日文、韩文均可直接使用，统一保存为 UTF-8。</p></div></article>
          <article><b>02</b><div><h3>一个稳定 ID</h3><p>解决同名歌曲、现场版和路径更名后的身份冲突。</p></div></article>
          <article><b>03</b><div><h3>可选元数据</h3><p>同名 .meta.json 可补充多艺术家、专辑、别名与授权来源。</p></div></article>
        </div>
      </section>

      <section className="api-section" id="api">
        <div className="api-copy">
          <p className="eyebrow light"><span /> SIMPLE API</p>
          <h2>只轮询一份<br /><em>很小的清单。</em></h2>
          <p>
            软件定时请求 manifest。revision 没变化就停止；有变化时再下载 songs.json 并在本地搜索，避免反复拉取完整歌词库。
          </p>
          <ol>
            <li><b>1</b><span>每 6 小时请求 <code>/api/v1/manifest.json</code></span></li>
            <li><b>2</b><span>revision 变化后刷新 <code>/api/v1/songs.json</code></span></li>
            <li><b>3</b><span>使用结果中的 path 下载原始 TTML</span></li>
          </ol>
        </div>
        <div className="code-window" aria-label="客户端接入代码示例">
          <div className="code-title"><span><i /><i /><i /></span><b>update-check.js</b></div>
          <pre><code>{`const manifest = await fetch(
  "/api/v1/manifest.json",
  { headers: { "If-None-Match": etag } }
);

if (manifest.status === 304) return;

const next = await manifest.json();
if (next.revision !== localRevision) {
  await refreshSearchIndex(next.index);
}`}</code></pre>
        </div>
      </section>

      <section className="contribute-section" id="contribute">
        <p className="eyebrow"><span /> OPEN TO EVERYONE</p>
        <h2>提交一个文件，<br />剩下的交给自动化。</h2>
        <div className="contribute-grid">
          <div><b>01</b><h3>创建歌词</h3><p>运行创建命令，自动得到规范路径、稳定 ID 和元数据模板。</p></div>
          <div><b>02</b><h3>本地校验</h3><p>检查 TTML 结构、ID 重复、文件命名和必填元数据。</p></div>
          <div><b>03</b><h3>提交合并请求</h3><p>GitHub 检查通过后自动更新索引并发布，无需手工改目录。</p></div>
        </div>
      </section>

      <footer>
        <div className="brand"><span className="brand-mark">T</span><span>TTML Hub</span></div>
        <p>开放、可搜索、为软件而生。</p>
        <p>Schema v1 · UTF-8 · TTML</p>
      </footer>
    </main>
  );
}
