/**
 * Static GitHub Pages build: temporarily move API / Settings / Pregenerate
 * out of src/app (incompatible with output:export), build, then restore.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { devRouteStash, webRoot } from "./dev-route-stash.mjs";

const { stash, restore, recoverOrphanedStash } = devRouteStash(".pages-stash");

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

recoverOrphanedStash();

run("node", ["scripts/prepare-static-data.mjs"], {
  NEXT_PUBLIC_STATIC_SITE: "true",
});

try {
  stash();
  rm(path.join(webRoot, ".next"));
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  run("npx", ["next", "build"], {
    NEXT_PUBLIC_STATIC_SITE: "true",
    NEXT_PUBLIC_BASE_PATH: basePath,
  });
} finally {
  restore();
}
