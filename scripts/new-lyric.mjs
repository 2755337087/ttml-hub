import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));

function safeName(value, label) {
  if (!value?.trim()) throw new Error(`缺少 --${label}`);
  return value.trim().normalize("NFC").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
}

async function main() {
  const title = safeName(args.title, "title");
  const artist = safeName(args.artist, "artist");
  const id = randomBytes(4).toString("hex");
  const directory = join(fileURLToPath(new URL("../lyrics/", import.meta.url)), artist);
  const stem = `${title} [${id}]`;
  const ttmlPath = join(directory, `${stem}.ttml`);
  const metaPath = join(directory, `${stem}.meta.json`);

  const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="und">
  <body>
    <div>
      <p begin="00:00.000" end="00:05.000">在这里填写第一句歌词</p>
    </div>
  </body>
</tt>
`;
  const meta = {
    title: args.title.trim(),
    artists: [args.artist.trim()],
    language: "und",
    aliases: [],
    license: "",
    sourceUrl: "",
  };

  await mkdir(directory, { recursive: true });
  await writeFile(ttmlPath, ttml, { flag: "wx" });
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, { flag: "wx" });
  console.log(`已创建：lyrics/${artist}/${stem}.ttml`);
  console.log("请填写歌词与授权来源，然后运行 npm run lyrics:check");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
