import assert from "node:assert/strict";
import test from "node:test";
import { insertTtmlHubId, matchingSourceIds, parseTtmlMetadata, stableSongId } from "../scripts/ttml-metadata.mjs";

const fixture = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:amll="http://www.example.com/ns/amll" xml:lang="zh-Hans"><head><metadata><amll:meta key="musicName" value="一点 (Live)"/><amll:meta key="artists" value="小鬼"/><amll:meta key="artists" value="王睿卓"/><amll:meta key="artists" value="Ghost (王琳凯)"/><amll:meta key="album" value="音你而来第二季 第6期 (Live)"/><amll:meta key="qqMusicId" value="001aYuPZ0RxbiM"/><amll:meta key="ncmMusicId" value="2701932053"/><amll:meta key="appleMusicId" value="1813826436"/></metadata></head><body><div/></body></tt>`;

test("parses AMLL title, every artist, album and platform id", () => {
  const meta = parseTtmlMetadata(fixture);
  assert.equal(meta.title, "一点 (Live)");
  assert.deepEqual(meta.artists, ["小鬼", "王睿卓", "Ghost (王琳凯)"]);
  assert.deepEqual(meta.albums, ["音你而来第二季 第6期 (Live)"]);
  assert.equal(meta.language, "zh-Hans");
  assert.equal(meta.hasTranslation, false);
  assert.equal(meta.hasTransliteration, false);
  assert.deepEqual(meta.sourceIds, { qqMusicId: "001aYuPZ0RxbiM", ncmMusicId: "2701932053", appleMusicId: "1813826436" });
  assert.match(stableSongId(meta.sourceIds), /^[a-f0-9]{16}$/);
});

test("detects language, translations and transliterations", () => {
  const xml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:amll="http://www.example.com/ns/amll" xml:lang="ja"><head><metadata><amll:meta key="musicName" value="测试歌曲"/><amll:meta key="artists" value="测试歌手"/><translations/><transliterations/></metadata></head><body><div/></body></tt>`;
  const meta = parseTtmlMetadata(xml);
  assert.equal(meta.language, "ja");
  assert.equal(meta.hasTranslation, true);
  assert.equal(meta.hasTransliteration, true);
});

test("ignores feature names inside XML comments", () => {
  const xml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml" xmlns:amll="http://www.example.com/ns/amll" xml:lang="en"><head><metadata><amll:meta key="musicName" value="Test"/><amll:meta key="artists" value="Artist"/><!-- <translations/><transliterations/> --></metadata></head><body><div/></body></tt>`;
  const meta = parseTtmlMetadata(xml);
  assert.equal(meta.language, "en");
  assert.equal(meta.hasTranslation, false);
  assert.equal(meta.hasTransliteration, false);
});

test("treats any matching platform id as the same song", () => {
  const existing = { appleMusicId: "100", qqMusicId: "QQ-A", ncmMusicId: "200" };
  assert.deepEqual(matchingSourceIds({ appleMusicId: "100" }, existing), [{ key: "appleMusicId", value: "100" }]);
  assert.deepEqual(matchingSourceIds({ qqMusicId: "QQ-A" }, existing), [{ key: "qqMusicId", value: "QQ-A" }]);
  assert.deepEqual(matchingSourceIds({ ncmMusicId: "200" }, existing), [{ key: "ncmMusicId", value: "200" }]);
  assert.deepEqual(matchingSourceIds({ appleMusicId: "200" }, existing), []);
});

test("persists a generated TTML Hub id in metadata", () => {
  const id = "40a911ffc7ba955c";
  const updated = insertTtmlHubId(fixture, id);
  assert.equal(parseTtmlMetadata(updated).sourceIds.ttmlHubId, id);
  assert.equal(stableSongId({ ttmlHubId: id }), id);
  assert.equal(insertTtmlHubId(updated, id), updated);
});
