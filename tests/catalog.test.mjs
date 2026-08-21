import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifestUrl = new URL("../public/api/v1/manifest.json", import.meta.url);
const indexUrl = new URL("../public/api/v1/songs.json", import.meta.url);

test("manifest and index share a revision", async () => {
  const [manifest, index] = await Promise.all([
    readFile(manifestUrl, "utf8").then(JSON.parse),
    readFile(indexUrl, "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(index.schemaVersion, 2);
  assert.equal(manifest.revision, index.revision);
  assert.equal(manifest.songCount, index.songs.length);
});

test("manifest hashes the exact published index bytes", async () => {
  const [manifest, indexText] = await Promise.all([
    readFile(manifestUrl, "utf8").then(JSON.parse),
    readFile(indexUrl, "utf8"),
  ]);
  const actualHash = createHash("sha256").update(indexText).digest("hex");
  assert.equal(manifest.indexSha256, actualHash);
});

test("every indexed song has a stable id and downloadable path", async () => {
  const index = JSON.parse(await readFile(indexUrl, "utf8"));
  for (const song of index.songs) {
    assert.match(song.id, /^[a-f0-9]{16}$/);
    assert.ok(song.title);
    assert.ok(song.artists.length);
    assert.ok(song.language);
    assert.equal(typeof song.hasTranslation, "boolean");
    assert.equal(typeof song.hasTransliteration, "boolean");
    for (const values of Object.values(song.sourceIds ?? {})) {
      assert.ok(Array.isArray(values));
      assert.ok(values.length);
      values.forEach((value) => assert.ok(typeof value === "string" && value));
    }
    assert.match(song.sha256, /^[a-f0-9]{64}$/);
    await readFile(new URL(`../public/${song.path}`, import.meta.url));
  }
});
