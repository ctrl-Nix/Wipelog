import Link from "next/link";
import { listAssets } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { assets, counts } = await listAssets();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/assets/new" className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          Add asset
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {(["assets", "runs", "certificates"] as const).map((k) => (
          <div key={k} className="rounded-lg border bg-white p-4">
            <div className="text-3xl font-bold">{counts[k]}</div>
            <div className="text-sm capitalize text-slate-600">{k}</div>
          </div>
        ))}
      </div>
      {assets.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white p-8 text-center text-slate-600">
          No assets yet. Click <b>Add asset</b>, then create a demo wipe run from the asset page.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-3">Asset tag</th><th className="p-3">Device</th>
                <th className="p-3">Storage</th><th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-3"><Link className="font-medium text-blue-700 underline" href={`/assets/${a.id}`}>{a.asset_tag}</Link></td>
                  <td className="p-3">{[a.manufacturer, a.model].filter(Boolean).join(" ") || "—"}</td>
                  <td className="p-3">{a.storage_type}</td>
                  <td className="p-3">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}