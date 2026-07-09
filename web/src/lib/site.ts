/** True for GitHub Pages static export builds. */
export function isStaticSite(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_SITE === "true";
}

/** Base path for assets/fetch (e.g. `/os-taxonomy` on project Pages). */
export function siteBasePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  if (!raw || raw === "/") return "";
  return raw.startsWith("/") ? raw.replace(/\/+$/, "") : `/${raw.replace(/\/+$/, "")}`;
}

export function withBasePath(path: string): string {
  const base = siteBasePath();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
