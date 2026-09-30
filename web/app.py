"""
AI-Verified Secure Data Wiping & Certification Tool
Local Web Application (Flask).
Binds to 127.0.0.1 only, debug=False.
"""
import copy
import hashlib
import json
import os
import sys
import threading
import time
import uuid
from pathlib import Path
from flask import Flask, jsonify, render_template, request, send_file

# Resolve project root and python paths
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python"))

from wipe import check_target, collect, create_samples, run_wipe
from classifier import scan_file
from certificate import build_payload, canonical, ensure_keys, PRIV, PUB
from cryptography.hazmat.primitives.serialization import (
    Encoding, PublicFormat, load_pem_private_key, load_pem_public_key
)
from cryptography.exceptions import InvalidSignature

try:
    import ledger
except ImportError:
    ledger = None

app = Flask(__name__, template_folder=str(Path(__file__).resolve().parent / "templates"),
            static_folder=str(Path(__file__).resolve().parent / "static"))

SANDBOX_DIR = (ROOT / "sandbox").resolve()
OUTPUTS_DIR = (ROOT / "outputs").resolve()

# Ensure required workspace directories exist
SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)

# Global wipe job state and single-worker lock
wipe_lock = threading.Lock()
jobs = {}
last_issued_cert = None


def resolve_sandbox_target(target_name: str) -> Path:
    """
    Strict security validation:
    1. Browser may ONLY specify items inside ROOT/sandbox.
    2. No arbitrary paths, drive letters, or parent directory traversal.
    3. Re-validates with check_target() from wipe.py.
    """
    if not target_name or target_name.strip() in (".", "", "sandbox", "sandbox/"):
        target_path = SANDBOX_DIR
    else:
        clean_name = target_name.strip()
        p = Path(clean_name)
        if p.is_absolute() or (len(p.parts) > 0 and (":" in p.parts[0] or p.parts[0].startswith("/") or p.parts[0].startswith("\\"))):
            raise ValueError("Refusing target: absolute paths and drive roots are not allowed")
        target_path = (SANDBOX_DIR / p).resolve()

    # Confirm resolved path is inside sandbox
    if target_path != SANDBOX_DIR and SANDBOX_DIR not in target_path.parents:
        raise ValueError("Refusing target: path must be strictly inside sandbox/")

    # Re-validate with check_target from wipe.py
    try:
        validated = check_target(target_path)
    except SystemExit as e:
        raise ValueError(str(e))

    return validated


def verify_certificate_obj(cert_obj: dict, manifest_bytes: bytes = None) -> tuple[bool, str, dict]:
    """Verify Ed25519 signature and optional manifest hash against public key."""
    try:
        payload = cert_obj["payload"]
        sig = bytes.fromhex(cert_obj["signature"])
        embedded = cert_obj["public_key"]
    except Exception as e:
        return False, f"malformed certificate ({e})", None

    ensure_keys()
    if not PUB.exists():
        return False, "trusted issuer public key missing", None

    try:
        trusted = load_pem_public_key(PUB.read_bytes())
        trusted_hex = trusted.public_bytes(Encoding.Raw, PublicFormat.Raw).hex()
    except Exception as e:
        return False, f"failed to load trusted public key ({e})", None

    if embedded != trusted_hex:
        return False, "signed by an untrusted key (not the known issuer)", None

    try:
        trusted.verify(sig, canonical(payload))
    except InvalidSignature:
        return False, "signature mismatch, certificate was modified", None
    except Exception as e:
        return False, f"signature verification failed: {e}", None

    if manifest_bytes is not None:
        expected_sha = payload.get("manifest_sha256")
        h = hashlib.sha256(manifest_bytes).hexdigest()
        if h != expected_sha:
            # Check CRLF vs LF line ending variations across OS/browser transfers
            h_crlf = hashlib.sha256(manifest_bytes.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")).hexdigest()
            h_lf = hashlib.sha256(manifest_bytes.replace(b"\r\n", b"\n")).hexdigest()
            if h_crlf == expected_sha:
                h = h_crlf
            elif h_lf == expected_sha:
                h = h_lf
            else:
                try:
                    m_obj = json.loads(manifest_bytes.decode("utf-8"))
                    alt_h1 = hashlib.sha256(json.dumps(m_obj, indent=2).encode("utf-8")).hexdigest()
                    alt_h2 = hashlib.sha256(json.dumps(m_obj, indent=2).replace("\n", "\r\n").encode("utf-8")).hexdigest()
                    if alt_h1 == expected_sha:
                        h = alt_h1
                    elif alt_h2 == expected_sha:
                        h = alt_h2
                except Exception:
                    pass
        if h != expected_sha:
            return False, "manifest does not match the certificate", None

    details = {
        "cert_id": payload.get("cert_id"),
        "device": payload.get("device", {}),
        "issued_at": payload.get("issued_at"),
        "result": payload.get("result"),
        "file_count": payload.get("erasure", {}).get("file_count"),
        "bytes": payload.get("erasure", {}).get("bytes"),
        "method": payload.get("erasure", {}).get("method"),
        "overall_verdict": payload.get("ai_verification", {}).get("overall_verdict"),
    }
    if ledger is not None:
        try:
            l_ok, l_msg = ledger.verify()
            details["ledger"] = {
                "chain_valid": l_ok,
                "chain_message": l_msg,
                "recorded": ledger.contains(payload)
            }
        except Exception:
            pass
    return True, "VALID: signature verified", details


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/samples", methods=["POST"])
def api_samples():
    try:
        SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
        create_samples()
        files = collect(SANDBOX_DIR)
        return jsonify({
            "success": True,
            "message": f"Sample files created in sandbox/ ({len(files)} files)",
            "file_count": len(files)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/targets", methods=["GET"])
def api_targets():
    try:
        SANDBOX_DIR.mkdir(parents=True, exist_ok=True)
        all_files = collect(SANDBOX_DIR)
        total_size = sum(f.stat().st_size for f in all_files)

        targets = [
            {
                "name": "Entire Sandbox (all files)",
                "target": ".",
                "size": total_size,
                "file_count": len(all_files),
                "is_dir": True,
            }
        ]

        for item in sorted(SANDBOX_DIR.iterdir()):
            if item.name.startswith("."):
                continue
            if item.is_file():
                targets.append({
                    "name": item.name,
                    "target": item.name,
                    "size": item.stat().st_size,
                    "file_count": 1,
                    "is_dir": False,
                })
            elif item.is_dir():
                sub_files = collect(item)
                targets.append({
                    "name": f"{item.name}/",
                    "target": item.name,
                    "size": sum(f.stat().st_size for f in sub_files),
                    "file_count": len(sub_files),
                    "is_dir": True,
                })

        return jsonify(targets)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scan", methods=["POST"])
def api_scan():
    data = request.get_json(silent=True) or {}
    target_str = data.get("target", ".")
    try:
        target_path = resolve_sandbox_target(target_str)
        files = collect(target_path)
        if not files:
            return jsonify({"error": "No files found to scan in selected target", "files": []}), 400

        results = []
        for f in files:
            s = scan_file(f)
            rel = str(f.relative_to(SANDBOX_DIR)).replace("\\", "/")
            results.append({
                "name": f.name,
                "path": rel,
                "size": f.stat().st_size,
                "verdict": s["verdict"],
                "flagged_blocks": s["flagged_blocks"],
                "blocks": s["blocks"],
                "max_risk": s["max_risk"],
                "mean_risk": s["mean_risk"],
                "block_risks": s.get("block_risks", [])
            })

        return jsonify({"target": target_str, "files": results})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/wipe", methods=["POST"])
def api_wipe():
    data = request.get_json(silent=True) or {}
    confirm = data.get("confirm", "")
    if confirm != "WIPE":
        return jsonify({"error": "Confirmation failed: You must type 'WIPE' to execute secure erase."}), 400

    target_str = data.get("target", ".")
    delete_after = bool(data.get("delete", False))

    try:
        target_path = resolve_sandbox_target(target_str)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if not wipe_lock.acquire(blocking=False):
        return jsonify({"error": "A wipe job is currently active. Only one wipe job can run at a time."}), 409

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "status": "running",
        "target": target_str,
        "delete": delete_after,
        "progress": {"file": "", "index": 0, "total": 0, "phase": "starting", "percent": 0},
        "result": None,
        "error": None,
        "created_at": time.time(),
    }

    def worker(jid, path, is_delete):
        try:
            def on_progress(evt):
                tot = max(evt.get("total", 1), 1)
                idx = evt.get("index", 0)
                phase = evt.get("phase", "")
                offset = 0.2 if phase == "scan_before" else (0.6 if phase == "overwrite" else 1.0)
                pct = int(min(100, max(0, ((idx + offset) / tot) * 100)))
                jobs[jid]["progress"] = {
                    "file": evt.get("file", ""),
                    "index": idx,
                    "total": tot,
                    "phase": phase,
                    "percent": pct
                }

            manifest = run_wipe(path, delete=is_delete, progress=on_progress)
            job_dir = OUTPUTS_DIR / jid
            job_dir.mkdir(parents=True, exist_ok=True)
            (job_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

            jobs[jid]["status"] = "completed"
            jobs[jid]["progress"]["percent"] = 100
            jobs[jid]["progress"]["phase"] = "completed"
            jobs[jid]["result"] = manifest
        except Exception as e:
            jobs[jid]["status"] = "failed"
            jobs[jid]["error"] = str(e)
        finally:
            wipe_lock.release()

    t = threading.Thread(target=worker, args=(job_id, target_path, delete_after), daemon=True)
    t.start()

    return jsonify({"job_id": job_id, "status": "running"})


@app.route("/api/jobs/<job_id>", methods=["GET"])
def api_job_status(job_id):
    job = jobs.get(job_id)
    if job:
        return jsonify(job)

    # Check disk output
    try:
        uuid.UUID(job_id)
        job_dir = (OUTPUTS_DIR / job_id).resolve()
        if OUTPUTS_DIR in job_dir.parents and (job_dir / "manifest.json").exists():
            manifest = json.loads((job_dir / "manifest.json").read_text())
            return jsonify({
                "id": job_id,
                "status": "completed",
                "progress": {"percent": 100, "phase": "completed"},
                "result": manifest,
                "error": None
            })
    except Exception:
        pass

    return jsonify({"error": "Job not found"}), 404


@app.route("/api/certificate", methods=["POST"])
def api_certificate():
    global last_issued_cert
    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")
    label = (data.get("label") or "Demo-Device-01").strip()

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400

    try:
        uuid.UUID(job_id)
        job_dir = (OUTPUTS_DIR / job_id).resolve()
        if OUTPUTS_DIR not in job_dir.parents and job_dir != OUTPUTS_DIR:
            return jsonify({"error": "Invalid job_id path"}), 400
    except ValueError:
        return jsonify({"error": "Invalid job_id format"}), 400

    manifest_path = job_dir / "manifest.json"
    if not manifest_path.exists():
        return jsonify({"error": f"Manifest not found for job {job_id}"}), 404

    ensure_keys()
    try:
        payload = build_payload(manifest_path, label)
    except SystemExit as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400

    key = load_pem_private_key(PRIV.read_bytes(), password=None)
    cert = {
        "algorithm": "Ed25519",
        "public_key": key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw).hex(),
        "payload": payload,
        "signature": key.sign(canonical(payload)).hex(),
    }
    cert_path = job_dir / "certificate.json"
    cert_path.write_text(json.dumps(cert, indent=2))

    ledger_entry = None
    if ledger is not None:
        try:
            ledger_entry = ledger.append(cert)
        except Exception:
            pass

    last_issued_cert = cert

    return jsonify({
        "success": True,
        "cert_id": payload["cert_id"],
        "certificate": cert,
        "ledger_entry": ledger_entry
    })


@app.route("/api/ledger", methods=["GET"])
def api_ledger():
    if ledger is None:
        return jsonify({"error": "Ledger module not available"}), 500
    try:
        ok, msg = ledger.verify()
        entries = ledger._read()
        return jsonify({
            "valid": ok,
            "message": msg,
            "count": len(entries),
            "entries": entries[-20:],
            "last_entry": entries[-1] if entries else None
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ledger/verify", methods=["POST", "GET"])
def api_ledger_verify():
    if ledger is None:
        return jsonify({"error": "Ledger module not available"}), 500
    try:
        ok, msg = ledger.verify()
        entries = ledger._read()
        return jsonify({
            "valid": ok,
            "message": msg,
            "count": len(entries),
            "status": "VALID" if ok else "INVALID"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/ledger/tamper-demo", methods=["POST"])
def api_ledger_tamper_demo():
    if ledger is None:
        return jsonify({"error": "Ledger module not available"}), 500
    try:
        entries = ledger._read()
        if not entries:
            return jsonify({
                "error": "No entries in ledger yet. Please wipe files and issue a certificate first."
            }), 400

        # Simulate tamper on an ephemeral copy without ever modifying ledger.jsonl on disk
        import tempfile
        tampered_entries = copy.deepcopy(entries)
        idx_to_tamper = 0
        original_cid = tampered_entries[idx_to_tamper]["cert_id"]
        tampered_entries[idx_to_tamper]["cert_id"] = "x" + original_cid

        with tempfile.NamedTemporaryFile("w+", delete=False, suffix=".jsonl") as tf:
            tf_path = Path(tf.name)
            for entry in tampered_entries:
                tf.write(json.dumps(entry, sort_keys=True) + "\n")

        try:
            ok, msg = ledger.verify(tf_path)
        finally:
            if tf_path.exists():
                tf_path.unlink()

        return jsonify({
            "valid": ok,
            "message": msg,
            "tampered_index": idx_to_tamper,
            "original_cert_id": original_cid,
            "tampered_cert_id": "x" + original_cid,
            "details": {
                "rule": "Hash-chain integrity violation (SHA-256 mismatch)",
                "note": "Evaluated strictly on an in-memory/ephemeral copy. ledger.jsonl remains 100% pristine on disk."
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/download/<kind>/<job_id>", methods=["GET"])
def api_download(kind, job_id):
    if kind not in ("certificate", "manifest"):
        return jsonify({"error": "Invalid kind. Must be 'certificate' or 'manifest'"}), 400

    try:
        uuid.UUID(job_id)
        target_file = (OUTPUTS_DIR / job_id / f"{kind}.json").resolve()
        # Security rule 5: Never serve files outside outputs/
        if OUTPUTS_DIR not in target_file.parents:
            return jsonify({"error": "Access denied"}), 403
        if not target_file.exists():
            return jsonify({"error": f"{kind} file not found for job {job_id}"}), 404
        return send_file(
            target_file,
            mimetype="application/json",
            as_attachment=True,
            download_name=f"{kind}_{job_id[:8]}.json"
        )
    except ValueError:
        return jsonify({"error": "Invalid job_id"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/verify", methods=["POST"])
def api_verify():
    manifest_bytes = None
    if request.is_json:
        data = request.get_json(silent=True) or {}
        cert_data = data.get("certificate")
        if not cert_data:
            return jsonify({"valid": False, "reason": "No certificate provided", "details": None}), 400
        manifest_raw = data.get("manifest")
        if manifest_raw:
            manifest_bytes = json.dumps(manifest_raw).encode() if isinstance(manifest_raw, (dict, list)) else str(manifest_raw).encode()
    else:
        cert_file = request.files.get("certificate")
        if not cert_file:
            return jsonify({"valid": False, "reason": "Missing certificate file in upload", "details": None}), 400
        try:
            cert_data = json.loads(cert_file.read().decode("utf-8"))
        except Exception as e:
            return jsonify({"valid": False, "reason": f"Malformed certificate JSON ({e})", "details": None}), 400

        manifest_file = request.files.get("manifest")
        if manifest_file:
            manifest_bytes = manifest_file.read()

    valid, reason, details = verify_certificate_obj(cert_data, manifest_bytes)
    return jsonify({"valid": valid, "reason": reason, "details": details})


@app.route("/api/tamper-demo", methods=["POST"])
def api_tamper_demo():
    global last_issued_cert
    source_cert = last_issued_cert

    if not source_cert:
        # Search outputs for the most recent certificate
        candidates = sorted(OUTPUTS_DIR.glob("*/certificate.json"), key=os.path.getmtime, reverse=True)
        if candidates:
            try:
                source_cert = json.loads(candidates[0].read_text())
            except Exception:
                pass

    if not source_cert:
        # Check root certificate.json if available
        root_cert = ROOT / "certificate.json"
        if root_cert.exists():
            try:
                source_cert = json.loads(root_cert.read_text())
            except Exception:
                pass

    if not source_cert:
        return jsonify({
            "error": "No certificate available yet. Please complete a wipe and issue a certificate first."
        }), 400

    # Create in-memory tampered copy (NEVER written to disk)
    tampered = copy.deepcopy(source_cert)
    orig_count = tampered["payload"]["erasure"].get("file_count", 1)
    tampered["payload"]["erasure"]["file_count"] = orig_count + 1

    valid, reason, details = verify_certificate_obj(tampered)
    return jsonify({
        "valid": valid,
        "reason": reason,
        "tampered_field": "payload.erasure.file_count",
        "original_value": orig_count,
        "tampered_value": orig_count + 1,
        "details": {
            "cert_id": tampered["payload"].get("cert_id"),
            "device": tampered["payload"].get("device", {}).get("label"),
            "note": "Evaluation was executed completely in-memory. No file was saved or altered on disk."
        }
    })


if __name__ == "__main__":
    ensure_keys()
    # Flask binds to 127.0.0.1 only, debug=False
    app.run(host="127.0.0.1", port=5000, debug=False)
