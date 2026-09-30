import { createHash } from "crypto";
import type { Asset } from "./types";

export const MAX_EVIDENCE_BYTES = 100 * 1024;

export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export type ParseResult =
  | { ok: true; evidence: Record<string, unknown> }
  | { ok: false; error: string };

export function parseEvidence(buf: Buffer): ParseResult {
  if (buf.length === 0) return { ok: false, error: "Evidence file is empty." };
  if (buf.length > MAX_EVIDENCE_BYTES) return { ok: false, error: "Evidence file exceeds 100 KB limit." };
  try {
    const data = JSON.parse(buf.toString("utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data))
      return { ok: false, error: "Evidence must be a JSON object." };
    return { ok: true, evidence: data as Record<string, unknown> };
  } catch {
    return { ok: false, error: "Evidence is not valid JSON." };
  }
}

const clip = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : v);

/** Keep only known, safe fields. Used for storage display and (later) AI input. */
export function sanitizeEvidence(ev: Record<string, unknown>) {
  const v = ev.verification as Record<string, unknown> | undefined;
  return {
    asset_serial: clip(ev.asset_serial),
    asset_tag: clip(ev.asset_tag),
    method: clip(ev.method),
    tool_name: clip(ev.tool_name),
    tool_version: clip(ev.tool_version),
    started_at: clip(ev.started_at),
    completed_at: clip(ev.completed_at),
    result: clip(ev.result),
    verification: v && typeof v === "object" ? { performed: v.performed, result: clip(v.result) } : undefined,
    demo: ev.demo === true,
  };
}

export type SampleKind = "pass" | "fail" | "review";

export function buildSample(kind: SampleKind, asset: Asset): Record<string, unknown> {
  const end = new Date();
  const start = new Date(end.getTime() - 252_000);
  const base: Record<string, unknown> = {
    asset_serial: asset.serial_number || "DEMO-SN-001",
    asset_tag: asset.asset_tag,
    method: "SIMULATED_ERASE",
    tool_name: "RecycleProof Demo Simulator",
    tool_version: "0.1.0",
    started_at: start.toISOString(),
    completed_at: end.toISOString(),
    result: "success",
    verification: { performed: true, result: "passed" },
    demo: true,
  };
  if (kind === "fail") base.asset_serial = "DEMO-SN-999";
  if (kind === "review") delete base.verification;
  return base;
}