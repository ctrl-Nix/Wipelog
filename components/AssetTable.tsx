"use client";
import Link from "next/link";
import { useState } from "react";
import type { Asset } from "@/lib/types";

export default function AssetTable({ assets }: { assets: Asset[] }) {
  const [q, setQ] = useState("");
  const s = q.trim().toLowerCase();
  const rows = s
    ? assets.filter((a) =>
        [a.asset_tag, a.serial_number, a.manufacturer, a.model].some((v) => v.toLowerCase().includes(s))
      )
    : assets;

  return (
    <div className="space-y-3">
      <label htmlFor="search" className="sr-only">Search assets</label>
      <input
        id="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by tag, serial, make or model"
        className="w-full rounded border bg-white p-2 text-sm"
      />
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3">Asset tag</th><th className="p-3">Device</th>
              <th className="p-3">Storage</th><th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="p-3"><Link className="font-medium text-blue-700 underline" href={`/assets/${a.id}`}>{a.asset_tag}</Link></td>
                <td className="p-3">{[a.manufacturer, a.model].filter(Boolean).join(" ") || "—"}</td>
                <td className="p-3">{a.storage_type}</td>
                <td className="p-3">{a.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-slate-500">No match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}