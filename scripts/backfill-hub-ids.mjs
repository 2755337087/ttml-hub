import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { insertTtmlHubId } from "./ttml-metadata.mjs";

const lyricsRoot = fileURLToPath(new URL("../lyrics/", import.meta.url));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }));
  return files.flat();
}

async function main() {
  let updated = 0;
  const metaFiles = (await walk(lyricsRoot)).filter((path) => path.endsWith(".meta.json"));
  for (const metaPath of metaFiles) {
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    if (Object.keys(meta.sourceIds ?? {}).length) continue;

    const id = String(meta.id ?? basename(metaPath, ".meta.json")).toLowerCase();
    if (!/^[a-f0-9]{16}$/u.test(id)) throw new Error(`${metaPath}: 无法生成有效的 ttmlHubId`);
    const ttmlPath = metaPath.slice(0, -extname(metaPath).length).replace(/\.meta$/u, "") + ".ttml";
    const content = await readFile(ttmlPath, "utf8");
    meta.sourceIds = { ttmlHubId: id };
    await writeFile(ttmlPath, insertTtmlHubId(content, id));
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    updated += 1;
    console.log(`已写入永久 ID：${meta.title} (${id})`);
  }
  console.log(`迁移完成：${updated} 首歌词`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
