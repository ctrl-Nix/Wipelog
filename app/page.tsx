import Link from "next/link";
import { listAssets } from "@/lib/service";
import AssetTable from "@/components/AssetTable";

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
        <AssetTable assets={assets} />
      )}
    </div>
  );
}