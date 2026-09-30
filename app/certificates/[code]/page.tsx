import { notFound } from "next/navigation";
import { lookupCertificate } from "@/lib/service";
import { AppError } from "@/lib/errors";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let c;
  try {
    c = await lookupCertificate(decodeURIComponent(code));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const s = c.snapshot;
  const base = process.env.APP_BASE_URL || "http://localhost:3000";

  const rows: [string, string][] = [
    ["Asset tag", s.asset_tag],
    ["Serial (masked)", s.serial_masked || "—"],
    ["Device", [s.manufacturer, s.model].filter(Boolean).join(" ") || "—"],
    ["Storage type", s.storage_type],
    ["Method", s.method],
    ["Tool / version", `${s.tool_name} ${s.tool_version}`],
    ["Evidence completed", s.completed_at ?? "—"],
    ["Evidence check result", s.result],
    ["Rule set", s.verifier_version],
    ["Issued", new Date(c.issued_at).toLocaleString()],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {c.integrity === "MISMATCH" && (
        <p role="alert" className="rounded border border-red-400 bg-red-50 p-3 font-semibold text-red-800">
          ✖ INTEGRITY WARNING: stored evidence no longer matches the certified digest.
        </p>
      )}
      <div className="relative overflow-hidden rounded-lg border-4 border-double border-slate-700 bg-white p-8">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black uppercase tracking-widest text-slate-200 -rotate-25 select-none">
          Demo · Simulated
        </div>
        <div className="relative">
          <h1 className="text-center text-2xl font-bold">Evidence Verification Certificate</h1>
          <p className="text-center text-sm font-bold text-amber-700">DEMO — SIMULATED — NOT A REAL WIPE</p>
          <p className="mt-4 text-center font-mono text-lg">{c.certificate_code}</p>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-t">
                  <td className="py-2 pr-4 text-slate-500">{k}</td>
                  <td className="py-2">{v}</td>
                </tr>
              ))}
              <tr className="border-t">
                <td className="py-2 pr-4 text-slate-500">Evidence SHA-256</td>
                <td className="break-all py-2 font-mono text-xs">{c.evidence_sha256}</td>
              </tr>
              <tr className="border-t">
                <td className="py-2 pr-4 text-slate-500">File integrity now</td>
                <td className="py-2">
                  {c.integrity === "verified" ? "✔ Verified (digest matches)" : c.integrity === "MISMATCH" ? "✖ MISMATCH" : "Evidence file unavailable"}
                </td>
              </tr>
              <tr className="border-t">
                <td className="py-2 pr-4 text-slate-500">Verify at</td>
                <td className="break-all py-2 text-xs">{base}/certificates/{c.certificate_code}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-5 border-t pt-3 text-xs text-slate-600">
            This prototype certificate records submitted evidence checks; it is not an independent guarantee of data
            destruction or a formal compliance attestation.
          </p>
        </div>
      </div>
      <PrintButton />
    </div>
  );
}