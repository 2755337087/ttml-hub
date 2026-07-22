import assert from "node:assert/strict";
import test from "node:test";
import { parseTtmlMetadata, stableSongId } from "../scripts/ttml-metadata.mjs";

const fixture = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:amll="http://www.example.com/ns/amll" xml:lang="zh-Hans"><head><metadata><amll:meta key="musicName" value="一点 (Live)"/><amll:meta key="artists" value="小鬼"/><amll:meta key="artists" value="王睿卓"/><amll:meta key="artists" value="Ghost (王琳凯)"/><amll:meta key="album" value="音你而来第二季 第6期 (Live)"/><amll:meta key="qqMusicId" value="001aYuPZ0RxbiM"/><amll:meta key="ncmMusicId" value="2701932053"/><amll:meta key="appleMusicId" value="1813826436"/></metadata></head><body><div/></body></tt>`;

test("parses AMLL title, every artist, album and platform id", () => {
  const meta = parseTtmlMetadata(fixture);
  assert.equal(meta.title, "一点 (Live)");
  assert.deepEqual(meta.artists, ["小鬼", "王睿卓", "Ghost (王琳凯)"]);
  assert.deepEqual(meta.albums, ["音你而来第二季 第6期 (Live)"]);
  assert.deepEqual(meta.sourceIds, { qqMusicId: "001aYuPZ0RxbiM", ncmMusicId: "2701932053", appleMusicId: "1813826436" });
  assert.match(stableSongId(meta.sourceIds), /^[a-f0-9]{16}$/);
});
