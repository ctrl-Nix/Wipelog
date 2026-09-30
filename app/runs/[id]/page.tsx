import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun } from "@/lib/service";
import { AppError } from "@/lib/errors";
import { StatusBadge, CheckBadge } from "@/components/StatusBadge";
import IssueButton from "@/components/IssueButton";
import ExplainPanel from "@/components/ExplainPanel";
import { aiEnabled, templateExplanation } from "@/lib/explain";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let data;
  try {
    data = await getRun(id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const { run, asset, certificate } = data;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold">Verification result</h1>
          <span className="text-lg"><StatusBadge status={run.verification_status} /></span>
        </div>
        <p className="mt-1 text-sm text-slate-600">
          This is a review of submitted evidence, not a validation of physical wiping.
          {run.simulated && <b> SIMULATED — NOT A REAL WIPE.</b>}
        </p>
        {asset && (
          <p className="mt-2 text-sm">
            Asset: <Link className="text-blue-700 underline" href={`/assets/${asset.id}`}>{asset.asset_tag}</Link>
          </p>
        )}
      </div>

      <section className="rounded-lg border bg-white">
        <h2 className="border-b p-3 font-semibold">Checks</h2>
        <ul>
          {run.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-3 border-b p-3 last:border-b-0">
              <CheckBadge status={c.status} />
              <div>
                <div className="font-medium">{c.label}</div>
                <div className="text-sm text-slate-700">{c.message}</div>
                {c.hint && c.status !== "pass" && <div className="text-xs text-slate-500">Next step: {c.hint}</div>}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-white p-4 text-sm">
        <h2 className="mb-1 font-semibold">Explanation</h2>
        <p>{templateExplanation(run)}</p>
        <p className="mt-1 text-xs text-slate-500">Generated from the rule results. Rules determine status.</p>
        {aiEnabled() && <ExplainPanel runId={run.id} />}
      </section>

      <section className="rounded-lg border bg-white p-4 text-sm">
        <div className="text-slate-500">Evidence SHA-256 (computed server-side)</div>
        <code className="break-all">{run.evidence_sha256}</code>
        <div className="mt-2 text-slate-500">Rule set: {run.verifier_version}</div>
      </section>

      <section>
        {run.verification_status === "Pass" ? (
          certificate ? (
            <Link href={`/certificates/${certificate.certificate_code}`} className="rounded bg-slate-900 px-4 py-2 font-semibold text-white">
              View certificate
            </Link>
          ) : (
            <IssueButton runId={run.id} />
          )
        ) : (
          <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            No certificate available: only runs with status Pass can be certified.
          </p>
        )}
      </section>
    </div>
  );
}