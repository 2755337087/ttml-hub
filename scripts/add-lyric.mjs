import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { createIdentity, createMetadata, parseArgs, required } from "./lyric-utils.mjs";
import { parseTtmlMetadata } from "./ttml-metadata.mjs";

async function main() {
  const args = parseArgs();
  const sourceFile = required(args.file, "file");
  if (extname(sourceFile).toLowerCase() !== ".ttml") throw new Error("--file 必须是 .ttml 文件");

  const content = await readFile(sourceFile, "utf8");
  if (!content.includes("<tt") || !content.includes("</tt>")) throw new Error("所选文件不是完整的 TTML 文档");

  const identity = createIdentity();
  const detected = parseTtmlMetadata(content);
  const meta = {
    ...createMetadata(args),
    language: detected.language,
    hasTranslation: detected.hasTranslation,
    hasTransliteration: detected.hasTransliteration,
  };
  await mkdir(identity.directory, { recursive: true });
  await copyFile(sourceFile, identity.ttmlPath);
  await writeFile(identity.metaPath, `${JSON.stringify(meta, null, 2)}\n`, { flag: "wx" });
  console.log(`已导入：${identity.displayPath}`);
  console.log(`艺术家：${meta.artists.join(" / ")}`);
  console.log("运行 npm run lyrics:check 后即可提交到 GitHub");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
