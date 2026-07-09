/**
 * Copy taxonomy + lesson cache into web/public/data for static / client loads.
 * Run before `next build` and `build:pages`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webRoot, "..");
const outDir = path.join(webRoot, "public", "data");

const copies = [
  {
    from: path.join(repoRoot, "data", "topics.json"),
    to: path.join(outDir, "topics.json"),
  },
  {
    from: path.join(repoRoot, "data", "dependencies.json"),
    to: path.join(outDir, "dependencies.json"),
  },
  {
    from: path.join(webRoot, "data", "lessons-cache.json"),
    to: path.join(outDir, "lessons-cache.json"),
  },
  {
    // Local-only personalized cache — never required for Pages; empty if missing.
    from: path.join(webRoot, "data", "lessons-cache-personalized.json"),
    to: path.join(outDir, "lessons-cache-personalized.json"),
    optionalEmpty: true,
  },
];

fs.mkdirSync(outDir, { recursive: true });

for (const { from, to, optionalEmpty } of copies) {
  if (!fs.existsSync(from)) {
    if (to.endsWith("lessons-cache.json") || optionalEmpty) {
      fs.writeFileSync(to, "{}");
      console.log(`wrote empty ${path.relative(webRoot, to)}`);
      continue;
    }
    throw new Error(`Missing source file: ${from}`);
  }
  // Pages / static export only ships the standard lesson cache.
  if (
    process.env.NEXT_PUBLIC_STATIC_SITE === "true" &&
    to.endsWith("lessons-cache-personalized.json")
  ) {
    fs.writeFileSync(to, "{}");
    console.log(`static site: empty personalized cache at ${path.relative(webRoot, to)}`);
    continue;
  }
  fs.copyFileSync(from, to);
  const mb = (fs.statSync(to).size / (1024 * 1024)).toFixed(2);
  console.log(`copied ${path.relative(repoRoot, from)} → public/data (${mb} MB)`);
}
