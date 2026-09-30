import Link from "next/link";
import { listAssets } from "@/lib/service";
import AssetTable from "@/components/AssetTable";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { assets, counts } = await listAssets();
  return (
    <div className="space-y-8 p-2">
      {/* Playful Cartoonish Hero Intro Card */}
      <div className="rounded-xl border-4 border-[#1E1233] bg-[#D3D3FF] p-6 shadow-[6px_6px_0px_#1E1233]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="inline-block rounded-md border-2 border-[#1E1233] bg-[#ED80E9] px-3 py-1 text-xs font-black text-[#1E1233] shadow-[2px_2px_0px_#1E1233] animate-float">
              PROVE DATA WAS ERASED ⚡
            </span>
            <h1 className="mt-2 text-3xl font-black text-[#1E1233]">
              Secure Storage Erasure & Forensic Proof
            </h1>
            <p className="mt-1 text-sm font-bold text-[#5C4D78]">
              DoD 3-pass hardware overwrite + 4KB block ML risk scanner + Ed25519 digital certificates
            </p>
          </div>

          <Link
            href="/assets/new"
            className="inline-flex items-center justify-center rounded-lg border-3 border-[#1E1233] bg-[#9400D3] px-6 py-3 text-sm font-black text-white shadow-[4px_4px_0px_#1E1233] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_#ED80E9] animate-bouncy"
          >
            START ERASE WORKFLOW ⚡
          </Link>
        </div>

        {/* Cartoon Step Flow */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="neo-card p-4 text-center transition-all cursor-pointer">
            <div className="text-3xl animate-float">💾</div>
            <div className="mt-2 font-mono text-xs font-black text-[#9400D3]">01. DEVICE</div>
            <div className="text-sm font-extrabold text-[#1E1233]">Target Storage</div>
            <div className="text-xs font-semibold text-[#5C4D78]">NVMe, SATA or VHD</div>
          </div>

          <div className="neo-card p-4 text-center transition-all cursor-pointer">
            <div className="text-3xl animate-float style-delay-1">⚡</div>
            <div className="mt-2 font-mono text-xs font-black text-[#9400D3]">02. OVERWRITE</div>
            <div className="text-sm font-extrabold text-[#1E1233]">DoD 3-Pass + fsync</div>
            <div className="text-xs font-semibold text-[#5C4D78]">Random → 0xFF → 0x00</div>
          </div>

          <div className="neo-card p-4 text-center transition-all cursor-pointer">
            <div className="text-3xl animate-float style-delay-2">🧠</div>
            <div className="mt-2 font-mono text-xs font-black text-[#9400D3]">03. AI SCAN</div>
            <div className="text-sm font-extrabold text-[#1E1233]">4KB Block Scanner</div>
            <div className="text-xs font-semibold text-[#5C4D78]">Entropy & Chi-Sq</div>
          </div>

          <div className="neo-card p-4 text-center transition-all cursor-pointer">
            <div className="text-3xl animate-float style-delay-3">📜</div>
            <div className="mt-2 font-mono text-xs font-black text-[#9400D3]">04. CERTIFY</div>
            <div className="text-sm font-extrabold text-[#1E1233]">Signed Certificate</div>
            <div className="text-xs font-semibold text-[#5C4D78]">Ed25519 & Ledger</div>
          </div>
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-3 gap-4">
        {(["assets", "runs", "certificates"] as const).map((k) => (
          <div key={k} className="rounded-xl border-3 border-[#1E1233] bg-white p-4 shadow-[4px_4px_0px_#1E1233]">
            <div className="text-3xl font-black text-[#9400D3]">{counts[k]}</div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#5C4D78]">{k}</div>
          </div>
        ))}
      </div>

      {assets.length === 0 ? (
        <p className="rounded-xl border-3 border-dashed border-[#1E1233] bg-[#FAF8FF] p-8 text-center text-sm font-bold text-[#5C4D78]">
          No assets yet. Click <b className="text-[#9400D3]">Add asset</b>, then create a demo wipe run from the asset page.
        </p>
      ) : (
        <AssetTable assets={assets} />
      )}
    </div>
  );
}