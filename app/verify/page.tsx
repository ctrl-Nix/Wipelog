"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Verify() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) router.push(`/certificates/${encodeURIComponent(code.trim())}`);
      }}
      className="mx-auto max-w-lg space-y-3 rounded-lg border bg-white p-6"
    >
      <h1 className="text-xl font-bold">Verify a certificate</h1>
      <label htmlFor="code" className="block text-sm font-medium">Certificate code</label>
      <input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="RP-XXXXX-XXXXX-XXXXX-XXXXX" className="w-full rounded border p-2 font-mono text-sm" />
      <button className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Look up</button>
    </form>
  );
}