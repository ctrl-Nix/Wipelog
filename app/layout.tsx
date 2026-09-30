import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "RecycleProof (demo)" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-black print:hidden">
          DEMO / SIMULATED EVIDENCE — this prototype does not erase any real drive.
        </div>
        <header className="border-b bg-white print:hidden">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold">RecycleProof</Link>
            <Link href="/" className="text-sm hover:underline">Dashboard</Link>
            <Link href="/assets/new" className="text-sm hover:underline">Add asset</Link>
            <Link href="/verify" className="text-sm hover:underline">Verify certificate</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}