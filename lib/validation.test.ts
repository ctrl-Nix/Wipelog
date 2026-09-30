import { describe, it, expect } from "vitest";
import { verifyEvidence } from "./validation";
import type { Asset } from "./types";

const asset: Asset = {
    id: "a1", asset_tag: "DEMO-LAPTOP-01", manufacturer: "Dell", model: "X",
    serial_number: "DEMO-SN-001", storage_type: "SSD", status: "registered", created_at: "",
};
const HASH = "a".repeat(64);
const good = () => ({
    asset_serial: "DEMO-SN-001", asset_tag: "DEMO-LAPTOP-01", method: "SIMULATED_ERASE",
    tool_name: "Demo", tool_version: "0.1.0",
    started_at: "2026-09-30T09:00:00Z", completed_at: "2026-09-30T09:04:12Z",
    result: "success", verification: { performed: true, result: "passed" }, demo: true,
});

describe("verifyEvidence", () => {
    it("passes valid evidence", () => expect(verifyEvidence(asset, good(), HASH).status).toBe("Pass"));
    it("fails on serial mismatch", () =>
        expect(verifyEvidence(asset, { ...good(), asset_serial: "DEMO-SN-999" }, HASH).status).toBe("Fail"));
    it("needs review with no identifiers", () => {
        const e: any = good(); delete e.asset_serial; delete e.asset_tag;
        expect(verifyEvidence(asset, e, HASH).status).toBe("Needs Review");
    });
    it("needs review on missing tool version", () => {
        const e: any = good(); delete e.tool_version;
        expect(verifyEvidence(asset, e, HASH).status).toBe("Needs Review");
    });
    it("fails when completion before start", () =>
        expect(verifyEvidence(asset, { ...good(), completed_at: "2026-09-30T08:00:00Z" }, HASH).status).toBe("Fail"));
    it("fails on explicit failed result", () =>
        expect(verifyEvidence(asset, { ...good(), result: "failed" }, HASH).status).toBe("Fail"));
    it("needs review when verification missing", () => {
        const e: any = good(); delete e.verification;
        expect(verifyEvidence(asset, e, HASH).status).toBe("Needs Review");
    });
    it("needs review when verification not performed", () =>
        expect(verifyEvidence(asset, { ...good(), verification: { performed: false } }, HASH).status).toBe("Needs Review"));
    it("fail dominates review", () => {
        const e: any = { ...good(), asset_serial: "X" }; delete e.verification;
        expect(verifyEvidence(asset, e, HASH).status).toBe("Fail");
    });
    it("needs review with no digest", () => expect(verifyEvidence(asset, good(), null).status).toBe("Needs Review"));
    it("needs review if not flagged demo", () =>
        expect(verifyEvidence(asset, { ...good(), demo: false }, HASH).status).toBe("Needs Review"));
    it("fails with no asset", () => expect(verifyEvidence(null, good(), HASH).status).toBe("Fail"));
});