/** True for GitHub Pages static export builds. */
export function isStaticSite(): boolean {
  return process.env.NEXT_PUBLIC_STATIC_SITE === "true";
}

/** True for private LAN static export (personalized lessons baked in). */
export function isPersonalizedSite(): boolean {
  return process.env.NEXT_PUBLIC_PERSONALIZED_SITE === "true";
}

/** Browse-only export: no Settings, Pregenerate, or Generate UI. */
export function isBrowseOnlySite(): boolean {
  return isStaticSite() || isPersonalizedSite();
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
