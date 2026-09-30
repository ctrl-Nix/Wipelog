"""Independently verify an erasure certificate. Exit code 0 = valid, 1 = invalid."""
import argparse, hashlib, json, sys
from pathlib import Path
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, load_pem_public_key
from certificate import canonical, PUB


def fail(msg):
    print(f"INVALID: {msg}")
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cert", nargs="?", default="certificate.json")
    ap.add_argument("--pub", default=str(PUB), help="trusted issuer public key (PEM)")
    ap.add_argument("--manifest", help="optionally check this manifest matches the certificate")
    ap.add_argument("--ledger", action="store_true", help="also check ledger chain and inclusion")
    a = ap.parse_args()

    try:
        cert = json.loads(Path(a.cert).read_text())
        payload, sig, embedded = cert["payload"], bytes.fromhex(cert["signature"]), cert["public_key"]
    except Exception as e:
        fail(f"malformed certificate ({e})")

    trusted = load_pem_public_key(Path(a.pub).read_bytes())
    trusted_hex = trusted.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    if embedded != trusted_hex:
        fail("signed by an untrusted key (not the known issuer)")
    try:
        trusted.verify(sig, canonical(payload))
    except InvalidSignature:
        fail("signature mismatch, certificate was modified")

    if a.manifest:
        h = hashlib.sha256(Path(a.manifest).read_bytes()).hexdigest()
        if h != payload["manifest_sha256"]:
            fail("manifest does not match the certificate")

    if a.ledger:
        import ledger
        ok, msg = ledger.verify()
        if not ok:
            fail(f"ledger broken: {msg}")
        if not ledger.contains(payload):
            fail("certificate not recorded in ledger")

    print("VALID: signature verified")
    print(f"  cert_id : {payload['cert_id']}")
    print(f"  device  : {payload['device']['label']} ({payload['device']['hostname']})")
    print(f"  issued  : {payload['issued_at']}")
    print(f"  result  : {payload['result']}  files={payload['erasure']['file_count']}")


if __name__ == "__main__":
    main()