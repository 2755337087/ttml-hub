import assert from "node:assert/strict";
import test from "node:test";
import { searchSongs } from "../app/search-utils.ts";

const songs = [
  {
    id: "7bac9ee6f4368388",
    title: "死ぬのがいいわ (不如死去)",
    artists: ["藤井风"],
    albums: ["HELP EVER HURT NEVER"],
  },
  {
    id: "e1e9065bb489dd74",
    title: "See You Again(feat. Charlie Puth)",
    artists: ["Wiz Khalifa", "Charlie Puth"],
    albums: ["Furious 7"],
  },
];

test("matches title and artist as separate terms", () => {
  assert.deepEqual(searchSongs(songs, "死ぬのがいいわ 藤井风").map((song) => song.id), ["7bac9ee6f4368388"]);
  assert.deepEqual(searchSongs(songs, "藤井风 死ぬのがいいわ").map((song) => song.id), ["7bac9ee6f4368388"]);
});

test("matches multiple English words across title and artists", () => {
  assert.deepEqual(searchSongs(songs, "See Again Wiz Khalifa").map((song) => song.id), ["e1e9065bb489dd74"]);
});

test("requires every search term to match", () => {
  assert.deepEqual(searchSongs(songs, "死ぬのがいいわ Charlie Puth"), []);
});
