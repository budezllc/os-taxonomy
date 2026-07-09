/**
 * Static GitHub Pages build: temporarily move API / Settings / Pregenerate
 * out of src/app (incompatible with output:export), build, then restore.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const stashRoot = path.join(webRoot, ".pages-stash");
const toStash = ["api", "settings", "pregenerate"];

function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: webRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function stash() {
  rm(stashRoot);
  fs.mkdirSync(stashRoot, { recursive: true });
  for (const name of toStash) {
    const dir = path.join(webRoot, "src", "app", name);
    if (!fs.existsSync(dir)) continue;
    const dest = path.join(stashRoot, name);
    fs.cpSync(dir, dest, { recursive: true });
    rm(dir);
    console.log(`stashed src/app/${name}`);
  }
}

function restore() {
  if (!fs.existsSync(stashRoot)) return;
  for (const name of fs.readdirSync(stashRoot)) {
    const from = path.join(stashRoot, name);
    const to = path.join(webRoot, "src", "app", name);
    if (fs.existsSync(to)) rm(to);
    fs.cpSync(from, to, { recursive: true });
    console.log(`restored src/app/${name}`);
  }
  rm(stashRoot);
}

// Force static-site data prep so personalized cache is never copied into out/.
run("node", ["scripts/prepare-static-data.mjs"], {
  NEXT_PUBLIC_STATIC_SITE: "true",
});

try {
  stash();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  run("npx", ["next", "build"], {
    NEXT_PUBLIC_STATIC_SITE: "true",
    NEXT_PUBLIC_BASE_PATH: basePath,
  });
} finally {
  restore();
}
