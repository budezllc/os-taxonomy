/**
 * Stash / restore src/app routes that are incompatible with static export.
 * Recovers orphaned stashes so interrupted builds do not delete dev routes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const webRoot = path.resolve(__dirname, "..");

export const DEV_ROUTE_NAMES = ["api", "settings", "pregenerate"];

export function devRouteStash(stashDirName) {
  const stashRoot = path.join(webRoot, stashDirName);

  function rm(dir) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  function restore() {
    if (!fs.existsSync(stashRoot)) return false;
    for (const name of fs.readdirSync(stashRoot)) {
      const from = path.join(stashRoot, name);
      const to = path.join(webRoot, "src", "app", name);
      if (fs.existsSync(to)) rm(to);
      fs.cpSync(from, to, { recursive: true });
      console.log(`restored src/app/${name}`);
    }
    rm(stashRoot);
    return true;
  }

  function recoverOrphanedStash() {
    if (!fs.existsSync(stashRoot)) return false;
    console.warn(
      `Found orphaned ${stashDirName}/ — restoring dev routes before continuing…`,
    );
    return restore();
  }

  function stash() {
    if (fs.existsSync(stashRoot)) {
      recoverOrphanedStash();
    }
    fs.mkdirSync(stashRoot, { recursive: true });
    for (const name of DEV_ROUTE_NAMES) {
      const dir = path.join(webRoot, "src", "app", name);
      if (!fs.existsSync(dir)) continue;
      const dest = path.join(stashRoot, name);
      fs.cpSync(dir, dest, { recursive: true });
      rm(dir);
      console.log(`stashed src/app/${name}`);
    }
  }

  return { stashRoot, stash, restore, recoverOrphanedStash };
}

/** Run before dev — recover any orphaned stash and verify routes exist. */
export function ensureDevRoutes() {
  for (const stashDirName of [".private-stash", ".pages-stash"]) {
    devRouteStash(stashDirName).recoverOrphanedStash();
  }

  const missing = DEV_ROUTE_NAMES.filter(
    (name) => !fs.existsSync(path.join(webRoot, "src", "app", name)),
  );
  if (missing.length === 0) return;

  console.error(
    `Missing dev routes: ${missing.map((n) => `src/app/${n}`).join(", ")}`,
  );
  console.error(
    "Restore from git: git checkout HEAD -- " +
      missing.map((n) => `web/src/app/${n}`).join(" "),
  );
  process.exit(1);
}
