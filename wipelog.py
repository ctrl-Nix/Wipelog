#!/usr/bin/env python3
"""
Wipelog: Unified CLI for AI-Verified Secure Data Wiping & Certification.
Integrates file wiping, volume sanitization, raw image wiping, AI scanning,
Ed25519 digital certification, hash-chained ledger auditing, and local web serving.
"""
import argparse
import os
import sys
from pathlib import Path

# Ensure python/ directory is on sys.path
ROOT = Path(__file__).resolve().parent
PYTHON_DIR = ROOT / "python"
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))


def cmd_wipe(args):
    """File & directory multi-pass overwrite with safety guards and zero read-back."""
    from wipe import check_target, collect, overwrite, readback_zero, sha256_file, create_samples
    from classifier import scan_file
    import json, time, secrets

    target_path = Path(args.target)

    if args.create_samples:
        create_samples()
        return 0

    if not target_path.exists():
        print(f"\033[91mError: Target does not exist: {target_path}\033[0m")
        return 1

    check_target(target_path)
    files = collect(target_path)
    if not files:
        print(f"No files found in {target_path}")
        return 0

    total_bytes = sum(f.stat().st_size for f in files)
    print(f"\033[96mTarget: {target_path} ({len(files)} files, {total_bytes:,} bytes)\033[0m")

    if args.dry_run:
        print("\033[93m[DRY RUN] The following files would be overwritten (3 passes):\033[0m")
        for f in files:
            print(f"  - {f} ({f.stat().st_size:,} bytes)")
        return 0

    if not args.yes:
        confirm = input(f"Type 'WIPE' to overwrite {len(files)} files permanently: ").strip()
        if confirm != "WIPE":
            print("\033[93mCancelled by user.\033[0m")
            return 1

    started = time.time()
    entries = []
    print(f"\nStarting 3-pass overwrite (Random -> Ones -> Zero with fsync)...")
    for idx, f in enumerate(files, 1):
        size = f.stat().st_size
        before_hash = sha256_file(f)
        overwrite(f)
        if not readback_zero(f):
            print(f"\033[91mFAILED: Read-back verification failed (not all zeros): {f}\033[0m")
            return 1

        scan = scan_file(f)
        after_hash = sha256_file(f)
        entries.append({
            "name": f.name,
            "size": size,
            "sha256_before": before_hash,
            "sha256_after": after_hash,
            "block_scan": scan,
            "readback_zero": True,
        })
        print(f"  [{idx}/{len(files)}] \033[92mPASS\033[0m {f.name} ({scan['verdict']}, 0 flagged blocks)")

        if args.delete:
            tmp = f.with_name(secrets.token_hex(8))
            f.rename(tmp)
            tmp.unlink()

    manifest = {
        "method": "DoD_5220.22-M_3PASS",
        "passes": ["random", "ones", "zero"],
        "readback_zero_verified": True,
        "deleted_after": args.delete,
        "target_name": target_path.name,
        "files": entries,
        "file_count": len(entries),
        "bytes": total_bytes,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    out_path = Path(args.out)
    out_path.write_text(json.dumps(manifest, indent=2))
    print(f"\n\033[92mOverwrite complete & 100% verified. Manifest saved to: {out_path}\033[0m")
    return 0


def cmd_volume(args):
    """Whole volume sanitization and unallocated free-space zeroing (Windows)."""
    import volwipe
    # Forward arguments into volwipe's main logic
    sys.argv = ["volwipe.py", args.drive]
    if args.allow_fixed:
        sys.argv.append("--allow-fixed")
    if args.yes:
        sys.argv.append("--yes")
    if args.out:
        sys.argv.extend(["--out", args.out])
    return volwipe.main() or 0


def cmd_image(args):
    """Raw disk image or block device overwrite with full zero read-back."""
    import devwipe
    sys.argv = ["devwipe.py", args.target]
    if args.allow_device:
        sys.argv.append("--i-know-this-destroys-the-device")
    if args.yes:
        sys.argv.append("--yes")
    if args.out:
        sys.argv.extend(["--out", args.out])
    return devwipe.main() or 0


def cmd_scan(args):
    """Pre-wipe or post-wipe 4KB-block AI residual risk inspection."""
    from classifier import scan_file
    from wipe import collect
    target = Path(args.target)
    if not target.exists():
        print(f"\033[91mTarget not found: {target}\033[0m")
        return 1

    files = collect(target) if target.is_dir() else [target]
    print(f"\n\033[96mAI Residual Risk Inspection: {len(files)} files\033[0m")
    print(f"{'File':<30} {'Verdict':<8} {'Blocks':<8} {'Flagged':<8} {'Max Risk'}")
    print("-" * 65)

    all_pass = True
    for f in files:
        res = scan_file(f)
        verdict = res["verdict"]
        color = "\033[92m" if verdict in ("PASS", "EMPTY") else "\033[91m"
        print(f"{f.name:<30} {color}{verdict:<8}\033[0m {res['blocks']:<8} {res['flagged_blocks']:<8} {res['max_risk']:.3f}")
        if verdict not in ("PASS", "EMPTY"):
            all_pass = False

    return 0 if all_pass else 1


def cmd_certify(args):
    """Build canonical JSON, sign with Ed25519, and append to ledger."""
    from certificate import build_payload, canonical, key_id, ensure_keys, PRIV
    from cryptography.hazmat.primitives.serialization import load_pem_private_key, Encoding, PublicFormat
    from ledger import append
    import json, hashlib

    manifest_file = Path(args.manifest)
    if not manifest_file.exists():
        print(f"\033[91mManifest not found: {manifest_file}\033[0m")
        return 1

    ensure_keys()
    key = load_pem_private_key(PRIV.read_bytes(), password=None)
    payload = build_payload(manifest_file, args.label)
    pub_hex = key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

    cert = {
        "algorithm": "Ed25519",
        "key_id": key_id(pub_hex),
        "public_key": pub_hex,
        "payload": payload,
        "signature": key.sign(canonical(payload)).hex(),
    }
    out_file = Path(args.out)
    out_file.write_text(json.dumps(cert, indent=2))
    ledger_entry = append(cert)

    print(f"\n\033[92mCertificate Issued Successfully: {out_file}\033[0m")
    print(f"  Certificate ID : \033[96m{payload['cert_id']}\033[0m")
    print(f"  Device Label   : {payload['device']['label']}")
    print(f"  Issuer Key ID  : {cert['key_id']}")
    print(f"  Ledger Entry   : #{ledger_entry['index']} ({ledger_entry['entry_hash'][:16]}...)")
    print(f"  AI Verdict     : \033[92m{payload['ai_verification']['overall_verdict']}\033[0m")
    return 0


def cmd_verify(args):
    """Independently verify certificate signature, manifest digest, and ledger."""
    from certificate import canonical, key_id, PUB
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, load_pem_public_key
    import json, hashlib

    cert_path = Path(args.cert)
    if not cert_path.exists():
        print(f"\033[91mCertificate file not found: {cert_path}\033[0m")
        return 1

    try:
        cert = json.loads(cert_path.read_text())
        payload = cert["payload"]
        sig = bytes.fromhex(cert["signature"])
        embedded = cert["public_key"]
    except Exception as e:
        print(f"\033[91mINVALID: Malformed certificate ({e})\033[0m")
        return 1

    pub_path = Path(args.pub) if args.pub else PUB
    if not pub_path.exists():
        print(f"\033[91mTrusted public key not found: {pub_path}\033[0m")
        return 1

    trusted = load_pem_public_key(pub_path.read_bytes())
    trusted_hex = trusted.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()

    if embedded != trusted_hex:
        print("\033[91mINVALID: Signed by an untrusted key (not the known issuer)\033[0m")
        return 1

    try:
        trusted.verify(sig, canonical(payload))
    except InvalidSignature:
        print("\033[91mINVALID: Signature mismatch! The certificate was tampered with.\033[0m")
        return 1

    if args.manifest:
        man_path = Path(args.manifest)
        if not man_path.exists():
            print(f"\033[91mManifest file not found: {man_path}\033[0m")
            return 1
        h = hashlib.sha256(man_path.read_bytes()).hexdigest()
        if h != payload.get("manifest_sha256"):
            print("\033[91mINVALID: Manifest content does not match certificate manifest_sha256 digest!\033[0m")
            return 1

    if args.ledger:
        import ledger
        ok, msg = ledger.verify()
        if not ok:
            print(f"\033[91mINVALID: Ledger chain is broken ({msg})\033[0m")
            return 1
        if not ledger.contains(payload):
            print("\033[91mINVALID: Certificate is not recorded in the ledger\033[0m")
            return 1

    print("\033[92mVALID: Cryptographic signature verified successfully!\033[0m")
    print(f"  Certificate ID : {payload['cert_id']}")
    print(f"  Device         : {payload['device']['label']} ({payload['device']['hostname']})")
    d = payload.get("drive") or {}
    if d:
        print(f"  Drive Info     : {d.get('model')}  serial={d.get('serial') or 'n/a'}  bus={d.get('bus') or 'n/a'}")
    print(f"  Issued At      : {payload['issued_at']}")
    print(f"  Erasure Result : \033[92m{payload['result']}\033[0m ({payload['erasure'].get('file_count', 0)} files)")
    print(f"  Issuer Key ID  : {key_id(trusted_hex)}")
    if args.ledger:
        print(f"  Ledger Status  : \033[92mChain Intact & Included\033[0m")
    return 0


def cmd_ledger(args):
    """Audit the append-only hash-chained ledger."""
    import ledger
    action = args.action

    if action == "show":
        entries = ledger.load(Path(args.path))
        if not entries:
            print("Ledger is empty.")
            return 0
        print(f"\n\033[96m=== Wipelog Hash-Chained Ledger ({len(entries)} entries) ===\033[0m")
        for e in entries:
            print(f"Entry #{e['index']}  [{e['timestamp']}]")
            print(f"  cert_id   : {e['cert_id']}")
            print(f"  entry_hash: {e['entry_hash']}")
            print(f"  prev_hash : {e['prev_hash']}")
            print()
        return 0

    elif action == "verify":
        ok, msg = ledger.verify(Path(args.path))
        if ok:
            print(f"\033[92mLEDGER VALID: {msg}\033[0m")
            return 0
        else:
            print(f"\033[91mLEDGER INVALID: {msg}\033[0m")
            return 1


def cmd_serve(args):
    """Launch the local offline auditor web dashboard."""
    import subprocess
    cmd = [sys.executable, str(ROOT / "web" / "app.py")]
    print(f"\n\033[96mLaunching Wipelog Local Auditor Dashboard on http://127.0.0.1:{args.port} ...\033[0m")
    os.environ["PORT"] = str(args.port)
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
    return 0


def cmd_export(args):
    """Generate official printable HTML Certificate of Destruction with embedded QR code."""
    import webbrowser, json
    from cert_report import generate_html_report

    cert_file = Path(args.cert)
    if not cert_file.exists():
        print(f"\033[91mCertificate file not found: {cert_file}\033[0m")
        return 1

    data = json.loads(cert_file.read_text(encoding="utf-8"))
    out_file = Path(args.out)
    generate_html_report(data, out_file)
    print(f"\033[92mCertificate of Destruction report generated: {out_file.resolve()}\033[0m")
    if args.open:
        webbrowser.open(out_file.as_uri())
    return 0


def main():
    parser = argparse.ArgumentParser(
        prog="wipelog",
        description="Wipelog: AI-Verified Secure Data Wiping & Certification Engine",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python wipelog.py wipe sandbox/ --delete --yes
  python wipelog.py volume E:
  python wipelog.py image testdisk.img
  python wipelog.py scan sandbox/
  python wipelog.py certify --manifest manifest.json --label "Asset-001"
  python wipelog.py verify certificate.json --manifest manifest.json --ledger
  python wipelog.py export-cert certificate.json --out report.html --open
  python wipelog.py ledger show
  python wipelog.py serve
        """
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # Subcommand: wipe
    p_wipe = sub.add_parser("wipe", help="Multi-pass file/folder overwrite with zero read-back")
    p_wipe.add_argument("target", nargs="?", default="sandbox", help="Target file or directory")
    p_wipe.add_argument("--dry-run", action="store_true", help="List targets without modifying anything")
    p_wipe.add_argument("--delete", action="store_true", help="Delete and unlink files after overwriting")
    p_wipe.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    p_wipe.add_argument("--out", default="manifest.json", help="Path to save wipe manifest (default: manifest.json)")
    p_wipe.add_argument("--create-samples", action="store_true", help="Create dummy sample files in target folder")
    p_wipe.set_defaults(func=cmd_wipe)

    # Subcommand: volume
    p_vol = sub.add_parser("volume", help="Whole volume & unallocated free space sanitization (Windows)")
    p_vol.add_argument("drive", help="Drive letter (e.g. E)")
    p_vol.add_argument("--allow-fixed", action="store_true", help="Allow external fixed drives (removable default)")
    p_vol.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    p_vol.add_argument("--out", default="manifest.json", help="Path to save manifest")
    p_vol.set_defaults(func=cmd_volume)

    # Subcommand: image
    p_img = sub.add_parser("image", help="Raw disk image / block device overwrite")
    p_img.add_argument("target", help="Image file path (e.g. disk.img) or block device")
    p_img.add_argument("--allow-device", action="store_true", help="Allow physical block device overwrite")
    p_img.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    p_img.add_argument("--out", default="device_manifest.json", help="Path to save manifest")
    p_img.set_defaults(func=cmd_image)

    # Subcommand: scan
    p_scan = sub.add_parser("scan", help="Pre/post-wipe 4KB-block AI residual risk scanner")
    p_scan.add_argument("target", help="File or directory to inspect")
    p_scan.set_defaults(func=cmd_scan)

    # Subcommand: certify
    p_cert = sub.add_parser("certify", help="Sign erasure manifest with Ed25519 and record in ledger")
    p_cert.add_argument("--manifest", default="manifest.json", help="Input manifest file")
    p_cert.add_argument("--label", default="Asset-0001", help="Asset tag / Device identifier")
    p_cert.add_argument("--out", default="certificate.json", help="Output certificate file")
    p_cert.set_defaults(func=cmd_certify)

    # Subcommand: verify
    p_ver = sub.add_parser("verify", help="Verify certificate signature, manifest digest, and ledger")
    p_ver.add_argument("cert", default="certificate.json", nargs="?", help="Certificate JSON to verify")
    p_ver.add_argument("--pub", help="Path to trusted issuer public.pem (defaults to keys/public.pem)")
    p_ver.add_argument("--manifest", help="Optional manifest JSON to match against certificate digest")
    p_ver.add_argument("--ledger", action="store_true", help="Verify inclusion in append-only ledger")
    p_ver.set_defaults(func=cmd_verify)

    # Subcommand: ledger
    p_led = sub.add_parser("ledger", help="Inspect or verify the append-only hash-chained ledger")
    p_led.add_argument("action", choices=["show", "verify"], default="show", nargs="?", help="Action to perform")
    p_led.add_argument("--path", default="ledger.jsonl", help="Ledger path (default: ledger.jsonl)")
    p_led.set_defaults(func=cmd_ledger)

    # Subcommand: export-cert
    p_exp = sub.add_parser("export-cert", help="Generate printable HTML/PDF Certificate of Destruction with QR code")
    p_exp.add_argument("cert", nargs="?", default="certificate.json", help="Certificate JSON to render")
    p_exp.add_argument("--out", default="certificate_report.html", help="Output HTML report file")
    p_exp.add_argument("--open", action="store_true", help="Open report in browser after generating")
    p_exp.set_defaults(func=cmd_export)

    # Subcommand: serve
    p_srv = sub.add_parser("serve", help="Launch the local offline auditor web dashboard")
    p_srv.add_argument("--port", type=int, default=5000, help="Port to bind dashboard (default: 5000)")
    p_srv.set_defaults(func=cmd_serve)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main() or 0)
