export type CheckStatus = "pass" | "fail" | "review";
export type RunStatus = "Pass" | "Fail" | "Needs Review";

export interface Check {
    key: string;
    label: string;
    status: CheckStatus;
    message: string;
    hint?: string;
}

export interface Asset {
    id: string;
    asset_tag: string;
    manufacturer: string;
    model: string;
    serial_number: string;
    storage_type: string;
    status: string;
    created_at: string;
}

export interface WipeRun {
    id: string;
    asset_id: string;
    method: string;
    tool_name: string;
    tool_version: string;
    started_at: string | null;
    completed_at: string | null;
    claimed_result: string;
    verification_status: RunStatus;
    checks: Check[];
    evidence_path: string;
    evidence_sha256: string;
    verifier_version: string;
    simulated: boolean;
    created_at: string;
}

export interface CertificateSnapshot {
    asset_tag: string;
    serial_masked: string;
    manufacturer: string;
    model: string;
    storage_type: string;
    method: string;
    tool_name: string;
    tool_version: string;
    completed_at: string | null;
    result: RunStatus;
    verifier_version: string;
    simulated: boolean;
}

export interface Certificate {
    id: string;
    certificate_code: string;
    wipe_run_id: string;
    asset_snapshot: CertificateSnapshot;
    evidence_sha256: string;
    issued_at: string;
    demo_label: boolean;
}

export interface Db {
    assets: Asset[];
    runs: WipeRun[];
    certificates: Certificate[];
}