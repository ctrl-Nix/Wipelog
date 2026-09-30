const BASE = process.env.BASE || "http://localhost:3000";
const j = async (path, opts = {}) => {
  const r = await fetch(BASE + path, { headers: { "Content-Type": "application/json" }, ...opts });
  return { status: r.status, body: await r.json() };
};
const ok = (cond, msg) => { console.log(cond ? "✅" : "❌", msg); if (!cond) process.exitCode = 1; };

const tag = "DEMO-LAPTOP-" + Math.floor(Math.random() * 9000 + 1000);
const a = await j("/api/assets", { method: "POST", body: JSON.stringify({ asset_tag: tag, storage_type: "SSD", manufacturer: "Dell", model: "Latitude", serial_number: "DEMO-SN-001" }) });
ok(a.status === 201, "asset created");

const dup = await j("/api/assets", { method: "POST", body: JSON.stringify({ asset_tag: tag, storage_type: "SSD" }) });
ok(dup.status === 409, "duplicate tag rejected");

const pass = await j("/api/runs", { method: "POST", body: JSON.stringify({ assetId: a.body.id, mode: "sample", sample: "pass" }) });
ok(pass.body.verification_status === "Pass", "passing sample => Pass");

const cert = await j(`/api/runs/${pass.body.id}/certificate`, { method: "POST" });
ok(cert.status === 201 && cert.body.certificate_code, "certificate issued: " + cert.body.certificate_code);

const look = await j(`/api/certificates/${cert.body.certificate_code}`);
ok(look.body.integrity === "verified", "lookup integrity verified");

const bad = await j("/api/runs", { method: "POST", body: JSON.stringify({ assetId: a.body.id, mode: "sample", sample: "fail" }) });
ok(bad.body.verification_status === "Fail", "mismatched serial => Fail");
ok((await j(`/api/runs/${bad.body.id}/certificate`, { method: "POST" })).status === 409, "certificate blocked for Fail");

const rev = await j("/api/runs", { method: "POST", body: JSON.stringify({ assetId: a.body.id, mode: "sample", sample: "review" }) });
ok(rev.body.verification_status === "Needs Review", "missing verification => Needs Review");

const junk = await j("/api/runs", { method: "POST", body: JSON.stringify({ assetId: a.body.id, mode: "upload", content: "not json{" }) });
ok(junk.body.verification_status === "Needs Review", "garbage upload => Needs Review (never Pass)");

ok((await j("/api/certificates/RP-FAKE")).status === 404, "unknown certificate => 404");
