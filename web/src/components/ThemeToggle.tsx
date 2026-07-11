"use client";

import { useEffect, useState } from "react";
import { applyTheme, readTheme, writeTheme, type ThemeMode } from "@/lib/prefs";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z"
      />
    </svg>
  );
}

type ThemeToggleProps = {
  variant?: "text" | "icon";
};

export function ThemeToggle({ variant = "text" }: ThemeToggleProps) {
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

  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  if (variant === "icon") {
    return (
      <button
        type="button"
        className="theme-toggle-icon"
        onClick={toggle}
        aria-label={label}
        title={label}
        disabled={!ready}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {ready ? (theme === "dark" ? "Light mode" : "Dark mode") : "Theme"}
    </button>
  );
}
