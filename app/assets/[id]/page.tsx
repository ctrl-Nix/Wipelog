import Link from "next/link";
import { notFound } from "next/navigation";
import { getAssetWithRuns } from "@/lib/service";
import { AppError } from "@/lib/errors";
import { StatusBadge } from "@/components/StatusBadge";
import RunPanel from "@/components/RunPanel";

export const dynamic = "force-dynamic";

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await getAssetWithRuns(id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const { asset, runs } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-4">
        <h1 className="text-xl font-bold">{asset.asset_tag}</h1>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <div><dt className="text-slate-500">Device</dt><dd>{[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "—"}</dd></div>
          <div><dt className="text-slate-500">Serial</dt><dd>{asset.serial_number || "—"}</dd></div>
          <div><dt className="text-slate-500">Storage</dt><dd>{asset.storage_type}</dd></div>
          <div><dt className="text-slate-500">Status</dt><dd>{asset.status}</dd></div>
        </dl>
      </div>

      <RunPanel assetId={asset.id} />

      <section>
        <h2 className="mb-2 font-semibold">Run history</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-600">No runs yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded border bg-white p-3">
                <div>
                  <Link href={`/runs/${r.id}`} className="font-medium text-blue-700 underline">{r.method}</Link>
                  <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <StatusBadge status={r.verification_status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}