import copy
import hashlib
import json
import sys
from pathlib import Path
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding, PrivateFormat, PublicFormat, NoEncryption, load_pem_private_key, load_pem_public_key
)
from cryptography.exceptions import InvalidSignature

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from certificate import build_payload, canonical, ensure_keys, PRIV, PUB
from wipe import create_samples, run_wipe


@pytest.fixture(scope="module")
def sample_cert_and_manifest(tmp_path_factory):
    """Generates a real wipe manifest and signed certificate for testing."""
    ensure_keys()
    d = tmp_path_factory.mktemp("cert_test_data")
    sandbox_test = ROOT / "sandbox"
    create_samples()
    manifest_dict = run_wipe(sandbox_test, delete=False)

    manifest_file = d / "manifest.json"
    manifest_bytes = json.dumps(manifest_dict, indent=2).encode()
    manifest_file.write_bytes(manifest_bytes)

    payload = build_payload(manifest_file, "Test-Device-Guard")
    key = load_pem_private_key(PRIV.read_bytes(), password=None)
    cert = {
        "algorithm": "Ed25519",
        "public_key": key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex(),
        "payload": payload,
        "signature": key.sign(canonical(payload)).hex(),
    }
    return cert, manifest_bytes


def verify_cert_helper(cert_obj, manifest_bytes=None, pub_pem=None):
    if pub_pem is None:
        pub_pem = PUB.read_bytes()
    trusted = load_pem_public_key(pub_pem)
    trusted_hex = trusted.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

    if cert_obj["public_key"] != trusted_hex:
        return False, "untrusted key"

    payload = cert_obj["payload"]
    sig = bytes.fromhex(cert_obj["signature"])
    try:
        trusted.verify(sig, canonical(payload))
    except InvalidSignature:
        return False, "signature mismatch"

    if manifest_bytes is not None:
        h = hashlib.sha256(manifest_bytes).hexdigest()
        if h != payload.get("manifest_sha256"):
            return False, "manifest mismatch"

    return True, "valid"


def test_valid_cert_verifies(sample_cert_and_manifest):
    cert, manifest_bytes = sample_cert_and_manifest
    ok, msg = verify_cert_helper(cert, manifest_bytes)
    assert ok is True
    assert msg == "valid"


def test_modified_field_fails(sample_cert_and_manifest):
    cert, manifest_bytes = sample_cert_and_manifest
    tampered = copy.deepcopy(cert)
    tampered["payload"]["erasure"]["file_count"] += 99

    ok, msg = verify_cert_helper(tampered, manifest_bytes)
    assert ok is False
    assert msg == "signature mismatch"


def test_wrong_key_fails(sample_cert_and_manifest):
    cert, manifest_bytes = sample_cert_and_manifest
    tampered = copy.deepcopy(cert)
    # Generate unrelated keypair
    other_key = Ed25519PrivateKey.generate()
    other_hex = other_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    tampered["public_key"] = other_hex

    ok, msg = verify_cert_helper(tampered, manifest_bytes)
    assert ok is False
    assert msg == "untrusted key"


def test_wrong_manifest_fails(sample_cert_and_manifest):
    cert, manifest_bytes = sample_cert_and_manifest
    wrong_manifest_bytes = manifest_bytes + b" "

    ok, msg = verify_cert_helper(cert, wrong_manifest_bytes)
    assert ok is False
    assert msg == "manifest mismatch"
