/**
 * Private personalized static build: stash API / Settings / Pregenerate,
 * copy real personalized lesson cache, export to web/out (no base path).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { devRouteStash, webRoot } from "./dev-route-stash.mjs";

const { stash, restore, recoverOrphanedStash } = devRouteStash(".private-stash");

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
  if (!fs.existsSync(dir)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : "";
    if (code === "ENOTEMPTY" || code === "EBUSY" || code === "EPERM") {
      console.warn(
        `Could not remove ${dir} (${code}). Stop "npm run dev" if the build fails.`,
      );
      return;
    }
    throw err;
  }
}

recoverOrphanedStash();

const personalizedSource = path.join(
  webRoot,
  "data",
  "lessons-cache-personalized.json",
);
if (!fs.existsSync(personalizedSource)) {
  console.error(
    "Missing web/data/lessons-cache-personalized.json — generate personalized lessons locally first (npm run dev → Settings → Personalized).",
  );
  process.exit(1);
}

run("node", ["scripts/prepare-static-data.mjs"], {
  NEXT_PUBLIC_PERSONALIZED_SITE: "true",
});

try {
  stash();
  rm(path.join(webRoot, ".next"));
  run("npx", ["next", "build"], {
    NEXT_PUBLIC_PERSONALIZED_SITE: "true",
    NEXT_PUBLIC_BASE_PATH: "",
  });
} finally {
  restore();
}
