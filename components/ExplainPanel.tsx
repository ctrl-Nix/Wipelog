"use client";
import { useState } from "react";

export default function ExplainPanel({ runId }: { runId: string }) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${runId}/explain`, { method: "POST" });
      const d = await res.json();
      setText(d.text || "Could not generate an explanation.");
      setSource(d.source || "");
    } catch {
      setText("Network error. The verdict above is unaffected.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-3">
      <button onClick={go} disabled={busy} className="rounded bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? "Generating…" : "Generate AI explanation (optional)"}
      </button>
      {text && (
        <div className="mt-2 rounded border bg-slate-50 p-3 text-sm">
          <p>{text}</p>
          <p className="mt-1 text-xs text-slate-500">
            {source === "ai"
              ? "AI-generated explanation; rules determine status."
              : "AI unavailable, showing template text. Rules determine status."}
          </p>
        </div>
      )}
    </div>
  );
}