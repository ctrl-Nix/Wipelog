"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function IssueButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function issue() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/runs/${runId}/certificate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push(`/certificates/${data.certificate_code}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div>
      <button disabled={busy} onClick={issue} className="rounded bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
        Issue demo certificate
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}