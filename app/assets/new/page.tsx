"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = ["SSD", "HDD", "NVMe", "eMMC", "USB", "Other"];
const input = "w-full rounded border p-2 text-sm";

export default function NewAsset() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push(`/assets/${data.id}`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-4 rounded-lg border bg-white p-6">
      <h1 className="text-xl font-bold">Add asset</h1>
      <div>
        <label htmlFor="asset_tag" className="mb-1 block text-sm font-medium">Asset tag *</label>
        <input id="asset_tag" name="asset_tag" required defaultValue="DEMO-LAPTOP-01" className={input} />
      </div>
      <div>
        <label htmlFor="storage_type" className="mb-1 block text-sm font-medium">Storage type *</label>
        <select id="storage_type" name="storage_type" className={input}>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="manufacturer" className="mb-1 block text-sm font-medium">Manufacturer</label>
          <input id="manufacturer" name="manufacturer" defaultValue="Dell" className={input} />
        </div>
        <div>
          <label htmlFor="model" className="mb-1 block text-sm font-medium">Model</label>
          <input id="model" name="model" defaultValue="Latitude 5420" className={input} />
        </div>
      </div>
      <div>
        <label htmlFor="serial_number" className="mb-1 block text-sm font-medium">Serial number</label>
        <input id="serial_number" name="serial_number" defaultValue="DEMO-SN-001" className={input} />
      </div>
      {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        Save asset
      </button>
    </form>
  );
}