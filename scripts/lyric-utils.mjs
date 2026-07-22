import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function parseArgs(values = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}

export function required(value, label) {
  if (!value?.trim()) throw new Error(`缺少 --${label}`);
  return value.trim().normalize("NFC");
}

export function parseArtists(value) {
  const artists = required(value, "artists")
    .split(/[,，、]/u)
    .map((artist) => artist.trim())
    .filter(Boolean);
  if (!artists.length) throw new Error("--artists 至少需要一位艺术家");
  return [...new Set(artists)];
}

export function createIdentity() {
  const id = randomBytes(8).toString("hex");
  const directory = join(fileURLToPath(new URL("../lyrics/", import.meta.url)), id.slice(0, 2));
  return {
    id,
    directory,
    ttmlPath: join(directory, `${id}.ttml`),
    metaPath: join(directory, `${id}.meta.json`),
    displayPath: `lyrics/${id.slice(0, 2)}/${id}.ttml`,
  };
}

export function createMetadata(args) {
  return {
    title: required(args.title, "title"),
    artists: parseArtists(args.artists ?? args.artist),
    album: args.album?.trim() ?? "",
    language: args.language?.trim() || "und",
    aliases: [],
    license: args.license?.trim() ?? "",
    sourceUrl: args.source?.trim() ?? "",
  };
}
