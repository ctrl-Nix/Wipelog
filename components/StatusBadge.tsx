import type { RunStatus, CheckStatus } from "@/lib/types";

const RUN: Record<RunStatus, string> = {
  Pass: "bg-green-100 text-green-800 border-green-400",
  Fail: "bg-red-100 text-red-800 border-red-400",
  "Needs Review": "bg-amber-100 text-amber-900 border-amber-400",
};
const ICON: Record<RunStatus, string> = { Pass: "✔", Fail: "✖", "Needs Review": "⚠" };

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-sm font-semibold ${RUN[status]}`}>
      {ICON[status]} {status}
    </span>
  );
}

const CHECK: Record<CheckStatus, { label: string; cls: string }> = {
  pass: { label: "✔ PASS", cls: "bg-green-100 text-green-800" },
  fail: { label: "✖ FAIL", cls: "bg-red-100 text-red-800" },
  review: { label: "⚠ REVIEW", cls: "bg-amber-100 text-amber-900" },
};

export function CheckBadge({ status }: { status: CheckStatus }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-bold ${CHECK[status].cls}`}>{CHECK[status].label}</span>;
}