import type { Asset, Check, RunStatus } from "./types";

export const VERIFIER_VERSION = "rules-1.0.0";

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));

export function verifyEvidence(
  asset: Asset | null,
  ev: Record<string, unknown> | null,
  sha256: string | null
): { status: RunStatus; checks: Check[]; verifier_version: string } {
  const checks: Check[] = [];

  // 1. Asset exists
  checks.push(
    asset
      ? { key: "asset_exists", label: "Asset exists", status: "pass", message: `Linked to asset ${asset.asset_tag}.` }
      : { key: "asset_exists", label: "Asset exists", status: "fail", message: "No registered asset is linked to this run.", hint: "Register the asset first." }
  );

  // 2. Identity match
  {
    const label = "Device identity match";
    const evSerial = str(ev?.asset_serial);
    const evTag = str(ev?.asset_tag);
    const comparisons: { name: string; ok: boolean }[] = [];
    if (asset && evSerial && asset.serial_number) comparisons.push({ name: "serial", ok: evSerial === asset.serial_number });
    if (asset && evTag) comparisons.push({ name: "asset tag", ok: evTag === asset.asset_tag });

    if (comparisons.length === 0) {
      checks.push({ key: "identity", label, status: "review", message: "Evidence has no comparable serial or asset tag.", hint: "Include asset_serial and/or asset_tag in the evidence." });
    } else if (comparisons.some((c) => !c.ok)) {
      checks.push({ key: "identity", label, status: "fail", message: "Evidence device identifier does not match registered asset.", hint: "Confirm the evidence belongs to this device." });
    } else {
      checks.push({ key: "identity", label, status: "pass", message: `Exact match on ${comparisons.map((c) => c.name).join(" + ")}.` });
    }
  }

  // 3. Required metadata
  {
    const required = ["method", "tool_name", "tool_version", "started_at", "completed_at", "result"];
    const missing = required.filter((k) => !str(ev?.[k]));
    if (!ev || typeof ev.verification !== "object" || ev.verification === null) missing.push("verification");
    checks.push(
      missing.length === 0
        ? { key: "metadata", label: "Required metadata present", status: "pass", message: "All required fields are present." }
        : { key: "metadata", label: "Required metadata present", status: "review", message: `Missing: ${missing.join(", ")}.`, hint: "Attach complete tool output." }
    );
  }

  // 4. Timeline sanity
  {
    const label = "Timeline sanity";
    const s = str(ev?.started_at);
    const c = str(ev?.completed_at);
    if (!s || !c) {
      checks.push({ key: "timeline", label, status: "review", message: "Start or completion time is missing." });
    } else if (!isIso(s) || !isIso(c)) {
      checks.push({ key: "timeline", label, status: "fail", message: "Timestamps are not valid ISO-8601." });
    } else if (Date.parse(c) < Date.parse(s)) {
      checks.push({ key: "timeline", label, status: "fail", message: "Completion time is before start time." });
    } else {
      checks.push({ key: "timeline", label, status: "pass", message: "Timestamps valid and correctly ordered." });
    }
  }

  // 5. Run outcome
  {
    const label = "Run outcome";
    const r = str(ev?.result)?.toLowerCase();
    if (!r) checks.push({ key: "outcome", label, status: "review", message: "No result reported." });
    else if (r === "success") checks.push({ key: "outcome", label, status: "pass", message: "Tool reported explicit success." });
    else if (["failed", "failure", "error", "aborted"].includes(r)) checks.push({ key: "outcome", label, status: "fail", message: `Tool reported "${r}".` });
    else checks.push({ key: "outcome", label, status: "review", message: `Unrecognised result value "${r}".` });
  }

  // 6. Verification evidence
  {
    const label = "Verification evidence";
    const v = ev?.verification;
    if (v && typeof v === "object") {
      const vo = v as Record<string, unknown>;
      const res = str(vo.result)?.toLowerCase();
      if (vo.performed === true && res === "passed") checks.push({ key: "verification", label, status: "pass", message: "Method-appropriate verification reported as passed." });
      else if (res === "failed") checks.push({ key: "verification", label, status: "fail", message: "Verification step reported failure." });
      else checks.push({ key: "verification", label, status: "review", message: "Verification was not performed or result is unknown." });
    } else {
      checks.push({ key: "verification", label, status: "review", message: "Method-appropriate verification evidence is missing.", hint: "Attach the tool's verification output." });
    }
  }

  // 7. Evidence integrity
  checks.push(
    sha256 && /^[a-f0-9]{64}$/.test(sha256)
      ? { key: "integrity", label: "Evidence integrity (SHA-256)", status: "pass", message: `Digest computed server-side: ${sha256.slice(0, 12)}…` }
      : { key: "integrity", label: "Evidence integrity (SHA-256)", status: "review", message: "No valid digest could be computed." }
  );

  // 8. Demo provenance
  checks.push(
    ev?.demo === true
      ? { key: "provenance", label: "Demo provenance", status: "pass", message: "SIMULATED — NOT A REAL WIPE." }
      : { key: "provenance", label: "Demo provenance", status: "review", message: "Evidence is not flagged as demo; this prototype cannot validate real-world tool output.", hint: "Real integrations are a later phase." }
  );

  const status: RunStatus = checks.some((c) => c.status === "fail")
    ? "Fail"
    : checks.some((c) => c.status === "review")
    ? "Needs Review"
    : "Pass";

  return { status, checks, verifier_version: VERIFIER_VERSION };
}