"use client";

import Link from "next/link";
import { isBrowseOnlySite } from "@/lib/site";

export function SiteNav() {
  const browseOnly = isBrowseOnlySite();
  return (
    <nav className="nav">
      <Link href="/">Dashboard</Link>
      {!browseOnly && (
        <>
          <Link href="/pregenerate">Pregenerate</Link>
          <Link href="/settings">Settings</Link>
        </>
      )}
    </nav>
  );
}
