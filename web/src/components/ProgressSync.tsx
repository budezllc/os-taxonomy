"use client";

import { useEffect, useRef, useState } from "react";
import {
  downloadProgressExport,
  importProgressJson,
  readProgress,
} from "@/lib/progress";

type Props = {
  onChanged?: () => void;
};

export function ProgressSync({ onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(Object.keys(readProgress()).length);
  }, []);

  const refreshCount = () => setCount(Object.keys(readProgress()).length);

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <p className="muted" style={{ margin: 0 }}>
        Progress is saved in this browser ({count} complete). Export or import a
        JSON file to sync devices.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            downloadProgressExport();
            setMsg("Exported progress file");
          }}
        >
          Export progress
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => inputRef.current?.click()}
        >
          Import progress
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const text = await file.text();
              importProgressJson(text, "merge");
              refreshCount();
              setMsg("Imported and merged progress");
              onChanged?.();
            } catch (err) {
              setMsg(err instanceof Error ? err.message : "Import failed");
            }
          }}
        />
      </div>
      {msg ? (
        <p className="muted" style={{ margin: 0 }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
