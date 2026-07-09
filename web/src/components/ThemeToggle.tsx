"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, writeTheme, type ThemeMode } from "@/lib/prefs";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = readTheme();
    applyTheme(current);
    setTheme(current);
    setReady(true);
  }, []);

  const toggle = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    writeTheme(next);
    setTheme(next);
  };

  return (
    <button
      type="button"
      className="btn theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      {ready ? (theme === "dark" ? "Light mode" : "Dark mode") : "Theme"}
    </button>
  );
}
