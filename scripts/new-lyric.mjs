import { mkdir, writeFile } from "node:fs/promises";
import { createIdentity, createMetadata, parseArgs } from "./lyric-utils.mjs";

async function main() {
  const args = parseArgs();
  const identity = createIdentity();
  const meta = createMetadata(args);
  const ttml = `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xml:lang="${meta.language}">
  <body>
    <div>
      <p begin="00:00.000" end="00:05.000">在这里填写第一句歌词</p>
    </div>
  </body>
</tt>
`;

  await mkdir(identity.directory, { recursive: true });
  await writeFile(identity.ttmlPath, ttml, { flag: "wx" });
  await writeFile(identity.metaPath, `${JSON.stringify(meta, null, 2)}\n`, { flag: "wx" });
  console.log(`已创建：${identity.displayPath}`);
  console.log("请填写歌词与授权来源，然后运行 npm run lyrics:check");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
