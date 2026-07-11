import type { NextConfig } from "next";

const isStatic =
  process.env.NEXT_PUBLIC_STATIC_SITE === "true" ||
  process.env.NEXT_PUBLIC_PERSONALIZED_SITE === "true";
const rawBase = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const basePath =
  !rawBase || rawBase === "/"
    ? ""
    : rawBase.startsWith("/")
      ? rawBase.replace(/\/+$/, "")
      : `/${rawBase.replace(/\/+$/, "")}`;

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  ...(basePath
    ? {
        basePath,
        assetPrefix: basePath,
      }
    : {}),
};

export default nextConfig;
