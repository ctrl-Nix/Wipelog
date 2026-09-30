"""Issue a signed (Ed25519) erasure certificate from manifest.json."""
import argparse, hashlib, json, platform, socket, time, uuid
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding, PrivateFormat, PublicFormat, NoEncryption, load_pem_private_key)

ROOT = Path(__file__).resolve().parent.parent
KEYS = ROOT / "keys"
PRIV, PUB = KEYS / "private.pem", KEYS / "public.pem"


def canonical(obj) -> bytes:
    """Deterministic JSON so signing and verifying hash the exact same bytes."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def key_id(pub_hex: str) -> str:
    return hashlib.sha256(bytes.fromhex(pub_hex)).hexdigest()[:16]


def ensure_keys():
    if PRIV.exists() and PUB.exists():
        return
    KEYS.mkdir(exist_ok=True)
    k = Ed25519PrivateKey.generate()
    PRIV.write_bytes(k.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()))
    PUB.write_bytes(k.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo))
    print(f"Generated new signing keypair in {KEYS}")


def build_payload(manifest_path: Path, label: str) -> dict:
    raw = manifest_path.read_bytes()
    m = json.loads(raw)
    files = []
    for f in m["files"]:
        s = f["block_scan"]
        files.append({
            "name": f["name"], "size": f["size"],
            "sha256_before": f["sha256_before"], "sha256_after": f["sha256_after"],
            "verdict": s["verdict"], "blocks": s["blocks"],
            "flagged_blocks": s["flagged_blocks"], "max_risk": s["max_risk"],
            "readback_zero": f.get("readback_zero", False),
        })
    ok = all(x["verdict"] in ("PASS", "EMPTY") and x["readback_zero"] for x in files)
    if not ok:
        raise SystemExit("Refusing to certify: at least one file failed AI verification or read-back check.")
    return {
        "cert_version": 1,
        "cert_id": str(uuid.uuid4()),
        "issued_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "device": {"label": label, "hostname": socket.gethostname(),
                   "os": platform.platform(), "machine": platform.machine()},
        "erasure": {k: m[k] for k in ("method", "passes", "deleted_after", "target_name",
                                      "file_count", "bytes", "started_at", "completed_at")},
        "ai_verification": {
            "model": "RandomForest, per-4KB-block residual-data classifier",
            "overall_verdict": "PASS",
            "flagged_blocks_total": sum(x["flagged_blocks"] for x in files),
            "worst_block_risk": max((x["max_risk"] for x in files), default=0.0),
        },
        "files": files,
        "manifest_sha256": hashlib.sha256(raw).hexdigest(),
        "result": "CERTIFIED_ERASED",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default="manifest.json")
    ap.add_argument("--label", default="Demo-Device-01", help="asset tag / device name")
    ap.add_argument("--out", default="certificate.json")
    a = ap.parse_args()

    ensure_keys()
    key = load_pem_private_key(PRIV.read_bytes(), password=None)
    payload = build_payload(Path(a.manifest), a.label)
    pub_hex = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    cert = {
        "algorithm": "Ed25519",
        "key_id": key_id(pub_hex),
        "public_key": pub_hex,
        "payload": payload,
        "signature": key.sign(canonical(payload)).hex(),
    }
    Path(a.out).write_text(json.dumps(cert, indent=2))
    from ledger import append
    e = append(cert)
    print(f"Certificate issued: {a.out}")
    print(f"  cert_id : {payload['cert_id']}")
    print(f"  result  : {payload['result']}")
    print(f"  digest  : {hashlib.sha256(canonical(payload)).hexdigest()[:32]}")
    print(f"  key_id  : {cert['key_id']}")
    print(f"  ledger  : entry #{e['index']}  {e['entry_hash'][:16]}...")


if __name__ == "__main__":
    main()