"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunPanel({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");

  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      router.push(`/runs/${data.id}`);
    } catch (e: any) {
      setError(e.message || "Network error");
      setBusy(false);
    }
  }

  const btn = "rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-50";

  return (
    <section className="rounded-lg border bg-white p-4">
      <h2 className="mb-1 font-semibold">Create demo wipe run</h2>
      <p className="mb-3 text-sm text-slate-600">
        Simulated evidence only. No device is connected and nothing is erased.
      </p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} className={`${btn} bg-green-700`} onClick={() => submit({ mode: "sample", sample: "pass" })}>
          Use passing demo sample
        </button>
        <button disabled={busy} className={`${btn} bg-red-700`} onClick={() => submit({ mode: "sample", sample: "fail" })}>
          Bad sample (wrong serial)
        </button>
        <button disabled={busy} className={`${btn} bg-amber-600`} onClick={() => submit({ mode: "sample", sample: "review" })}>
          Incomplete sample (no verification)
        </button>
      </div>

      <div className="mt-5 border-t pt-4">
        <label htmlFor="ev" className="mb-1 block text-sm font-medium">Or upload / paste JSON evidence (max 100 KB)</label>
        <input
          type="file"
          accept=".json,application/json"
          className="mb-2 block text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setContent(await f.text());
          }}
        />
        <textarea
          id="ev"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          className="w-full rounded border p-2 font-mono text-xs"
          placeholder='{"asset_serial": "...", ...}'
        />
        <button
          disabled={busy || !content.trim()}
          className={`${btn} mt-2 bg-slate-800`}
          onClick={() => submit({ mode: "upload", content })}
        >
          Verify uploaded evidence
        </button>
      </div>
      {error && <p role="alert" className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}