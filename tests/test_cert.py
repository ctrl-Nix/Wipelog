import json, subprocess, sys
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from certificate import build_payload, canonical

VERIFY = Path(__file__).resolve().parent.parent / "python" / "verify_cert.py"


def pem(key):
    return key.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)


def make_manifest(path, extra=""):
    m = {"method": "TEST", "passes": ["random", "ones", "zero"], "deleted_after": True,
         "target_name": "t", "file_count": 1, "bytes": 10,
         "started_at": "2026-01-01T00:00:00Z", "completed_at": "2026-01-01T00:01:00Z",
         "files": [{"name": "a.txt", "size": 10, "sha256_before": "a", "sha256_after": "b",
                    "readback_zero": True,
                    "block_scan": {"verdict": "PASS", "blocks": 1, "flagged_blocks": 0, "max_risk": 0.0}}]}
    path.write_text(json.dumps(m) + extra)


def setup(tmp_path):
    key = Ed25519PrivateKey.generate()
    man = tmp_path / "manifest.json"
    make_manifest(man)
    payload = build_payload(man, "unit-test")
    cert = {"algorithm": "Ed25519",
            "public_key": key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex(),
            "payload": payload, "signature": key.sign(canonical(payload)).hex()}
    c = tmp_path / "cert.json"
    c.write_text(json.dumps(cert))
    pub = tmp_path / "pub.pem"
    pub.write_bytes(pem(key))
    return key, man, c, pub, cert


def run(cert, pub, manifest=None):
    cmd = [sys.executable, str(VERIFY), str(cert), "--pub", str(pub)]
    if manifest:
        cmd += ["--manifest", str(manifest)]
    return subprocess.run(cmd, capture_output=True, text=True).returncode


def test_valid(tmp_path):
    _, man, c, pub, _ = setup(tmp_path)
    assert run(c, pub, man) == 0


def test_modified_field_fails(tmp_path):
    _, _, c, pub, cert = setup(tmp_path)
    cert["payload"]["erasure"]["file_count"] = 99
    c.write_text(json.dumps(cert))
    assert run(c, pub) == 1


def test_wrong_key_fails(tmp_path):
    _, _, c, pub, _ = setup(tmp_path)
    other = tmp_path / "other.pem"
    other.write_bytes(pem(Ed25519PrivateKey.generate()))
    assert run(c, other) == 1


def test_wrong_manifest_fails(tmp_path):
    _, man, c, pub, _ = setup(tmp_path)
    man.write_text(man.read_text() + " ")
    assert run(c, pub, man) == 1
