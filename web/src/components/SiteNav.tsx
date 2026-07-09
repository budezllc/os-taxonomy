"use client";

import Link from "next/link";
import { isStaticSite } from "@/lib/site";

export function SiteNav() {
  const staticSite = isStaticSite();
  return (
    <nav className="nav">
      <Link href="/">Dashboard</Link>
      {!staticSite && (
        <>
          <Link href="/pregenerate">Pregenerate</Link>
          <Link href="/settings">Settings</Link>
        </>
      )}
    </nav>
  );
}
