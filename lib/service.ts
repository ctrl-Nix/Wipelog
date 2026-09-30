import { randomUUID, randomBytes } from "crypto";
import { AppError } from "./errors";
import { mutateDb, readDb, readEvidenceFile, writeEvidenceFile } from "./db";
import { parseEvidence, sanitizeEvidence, sha256Hex, buildSample, SampleKind } from "./evidence";
import { verifyEvidence, VERIFIER_VERSION } from "./validation";
import type { Asset, Certificate, Check, WipeRun } from "./types";

const STORAGE_TYPES = ["SSD", "HDD", "NVMe", "eMMC", "USB", "Other"];
const clean = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---------- Assets ----------
export async function createAsset(input: Record<string, unknown>): Promise<Asset> {
    const asset_tag = clean(input.asset_tag, 64);
    const storage_type = clean(input.storage_type, 20);
    if (!asset_tag) throw new AppError("Asset tag is required.");
    if (!STORAGE_TYPES.includes(storage_type)) throw new AppError(`Storage type must be one of: ${STORAGE_TYPES.join(", ")}.`);

    return mutateDb((db) => {
        if (db.assets.some((a) => a.asset_tag.toLowerCase() === asset_tag.toLowerCase()))
            throw new AppError(`Asset tag "${asset_tag}" already exists.`, 409);
        const asset: Asset = {
            id: randomUUID(),
            asset_tag,
            manufacturer: clean(input.manufacturer),
            model: clean(input.model),
            serial_number: clean(input.serial_number),
            storage_type,
            status: "registered",
            created_at: new Date().toISOString(),
        };
        db.assets.unshift(asset);
        return asset;
    });
}

export async function listAssets() {
    const db = await readDb();
    return {
        assets: db.assets,
        counts: { assets: db.assets.length, runs: db.runs.length, certificates: db.certificates.length },
    };
}

export async function getAssetWithRuns(id: string) {
    const db = await readDb();
    const asset = db.assets.find((a) => a.id === id);
    if (!asset) throw new AppError("Asset not found.", 404);
    const runs = db.runs.filter((r) => r.asset_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const certificates = db.certificates.filter((c) => runs.some((r) => r.id === c.wipe_run_id));
    return { asset, runs, certificates };
}

// ---------- Runs ----------
export async function createRun(assetId: string, bytes: Buffer): Promise<WipeRun> {
    const db0 = await readDb();
    const asset = db0.assets.find((a) => a.id === assetId);
    if (!asset) throw new AppError("Asset not found.", 404);

    const runId = randomUUID();
    const sha = sha256Hex(bytes); // computed server-side on the original bytes
    const parsed = parseEvidence(bytes);
    const evidence_path = await writeEvidenceFile(runId, bytes);

    let run: WipeRun;
    if (!parsed.ok) {
        const checks: Check[] = [
            { key: "parse", label: "Evidence file readable", status: "review", message: parsed.error, hint: "Upload a valid JSON evidence file under 100 KB." },
        ];
        run = {
            id: runId, asset_id: assetId, method: "unknown", tool_name: "unknown", tool_version: "unknown",
            started_at: null, completed_at: null, claimed_result: "unknown",
            verification_status: "Needs Review", checks, evidence_path, evidence_sha256: sha,
            verifier_version: VERIFIER_VERSION, simulated: false, created_at: new Date().toISOString(),
        };
    } else {
        const safe = sanitizeEvidence(parsed.evidence);
        const { status, checks, verifier_version } = verifyEvidence(asset, parsed.evidence, sha);
        run = {
            id: runId, asset_id: assetId,
            method: String(safe.method ?? "unknown"),
            tool_name: String(safe.tool_name ?? "unknown"),
            tool_version: String(safe.tool_version ?? "unknown"),
            started_at: (safe.started_at as string) ?? null,
            completed_at: (safe.completed_at as string) ?? null,
            claimed_result: String(safe.result ?? "unknown"),
            verification_status: status, checks, evidence_path, evidence_sha256: sha,
            verifier_version, simulated: safe.demo, created_at: new Date().toISOString(),
        };
    }

    await mutateDb((db) => {
        db.runs.unshift(run);
        const a = db.assets.find((x) => x.id === assetId)!;
        a.status = run.verification_status === "Pass" ? "verified (demo)" : run.verification_status === "Fail" ? "failed verification" : "needs review";
    });
    return run;
}

export async function createRunFromSample(assetId: string, kind: SampleKind) {
    if (!["pass", "fail", "review"].includes(kind)) throw new AppError("Unknown sample kind.");
    const db = await readDb();
    const asset = db.assets.find((a) => a.id === assetId);
    if (!asset) throw new AppError("Asset not found.", 404);
    const bytes = Buffer.from(JSON.stringify(buildSample(kind, asset), null, 2), "utf8");
    return createRun(assetId, bytes);
}

export async function getRun(id: string) {
    const db = await readDb();
    const run = db.runs.find((r) => r.id === id);
    if (!run) throw new AppError("Run not found.", 404);
    const asset = db.assets.find((a) => a.id === run.asset_id) ?? null;
    const certificate = db.certificates.find((c) => c.wipe_run_id === id) ?? null;
    return { run, asset, certificate };
}

// ---------- Certificates ----------
const maskSerial = (s: string) => (s.length <= 4 ? "****" : "*".repeat(s.length - 4) + s.slice(-4));

function newCode() {
    const h = randomBytes(10).toString("hex").toUpperCase(); // 80 bits of entropy
    return `RP-${h.slice(0, 5)}-${h.slice(5, 10)}-${h.slice(10, 15)}-${h.slice(15, 20)}`;
}

export async function issueCertificate(runId: string): Promise<Certificate> {
    return mutateDb((db) => {
        const run = db.runs.find((r) => r.id === runId);
        if (!run) throw new AppError("Run not found.", 404);
        if (run.verification_status !== "Pass")
            throw new AppError("Certificates can only be issued for runs with status Pass.", 409);
        const existing = db.certificates.find((c) => c.wipe_run_id === runId);
        if (existing) return existing; // idempotent
        const asset = db.assets.find((a) => a.id === run.asset_id)!;
        const cert: Certificate = {
            id: randomUUID(),
            certificate_code: newCode(),
            wipe_run_id: runId,
            asset_snapshot: {
                asset_tag: asset.asset_tag,
                serial_masked: maskSerial(asset.serial_number),
                manufacturer: asset.manufacturer,
                model: asset.model,
                storage_type: asset.storage_type,
                method: run.method,
                tool_name: run.tool_name,
                tool_version: run.tool_version,
                completed_at: run.completed_at,
                result: run.verification_status,
                verifier_version: run.verifier_version,
                simulated: run.simulated,
            },
            evidence_sha256: run.evidence_sha256,
            issued_at: new Date().toISOString(),
            demo_label: true,
        };
        db.certificates.unshift(cert);
        return cert;
    });
}

export async function lookupCertificate(code: string) {
    const db = await readDb();
    const cert = db.certificates.find((c) => c.certificate_code === code.trim().toUpperCase());
    if (!cert) throw new AppError("Certificate not found.", 404); // no other info leaked
    const run = db.runs.find((r) => r.id === cert.wipe_run_id);
    let integrity: "verified" | "MISMATCH" | "evidence_unavailable" = "evidence_unavailable";
    if (run) {
        const bytes = await readEvidenceFile(run.evidence_path);
        if (bytes) integrity = sha256Hex(bytes) === cert.evidence_sha256 ? "verified" : "MISMATCH";
    }
    return {
        certificate_code: cert.certificate_code,
        issued_at: cert.issued_at,
        snapshot: cert.asset_snapshot,
        evidence_sha256: cert.evidence_sha256,
        demo_label: cert.demo_label,
        integrity,
    };
}