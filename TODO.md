# Wipelog - Development Roadmap & Implementation Log

This document tracks the three planned enhancements for Wipelog, with design decisions,
implementation details, and lessons documented for each completed stage.

---

## STATUS OVERVIEW

| Step | Feature                                  | Status      | Files                                       |
|------|------------------------------------------|-------------|---------------------------------------------|
| 1    | Unified Single CLI (`wipelog.py`)        | COMPLETE    | `wipelog.py`                                |
| 2    | Printable Certificate of Destruction     | COMPLETE    | `python/cert_report.py`, `requirements.txt` |
| 3    | One-Click Live Demo Script (`demo.ps1`)  | COMPLETE    | `demo.ps1`                                  |

---

## STEP 1 — Unified Single CLI (`wipelog.py`)

### Goal
Eliminate the need to know 6+ separate Python script paths. Replace with a single
tool that works like `git` or `docker` via subcommands.

### Design Decisions
- **Zero new dependencies**: Uses only stdlib `argparse` with `subparsers`. No `click`, no `tyrant`.
- **No rewriting of existing modules**: `wipelog.py` imports and calls functions from `python/*.py` directly.
  The original scripts remain usable standalone and as the Flask backend — nothing is broken.
- **`sys.path` injection**: The file inserts `python/` at import time so all subcommand functions
  can `from wipe import ...`, `from classifier import ...` etc. without `cd`-ing into the directory.
- **Colored output**: ANSI escape codes for Green (PASS), Red (FAIL), Cyan (info banners).
  Works natively on Windows 10+ and all Unix terminals. No `colorama` required.
- **Exit codes**: Every subcommand returns 0 on success, non-zero on failure.
  Shell scripts and CI pipelines can use `if (.venv\... wipelog.py verify cert.json) { ... }`.

### Subcommands

| Command       | Delegates To              | Description                                                      |
|---------------|---------------------------|------------------------------------------------------------------|
| `wipe`        | `python/wipe.py`          | Multi-pass file/folder overwrite, zero read-back, manifest       |
| `volume`      | `python/volwipe.py`       | Windows volume + free-space sanitization                         |
| `image`       | `python/devwipe.py`       | Raw disk image / block device overwrite                          |
| `scan`        | `python/classifier.py`    | 4KB block AI residual risk table                                 |
| `certify`     | `python/certificate.py`   | Ed25519 sign + ledger append                                     |
| `verify`      | `python/verify_cert.py`   | Signature + manifest + ledger chain check                        |
| `ledger`      | `python/ledger.py`        | `show` (pretty print) or `verify` (chain integrity)              |
| `export-cert` | `python/cert_report.py`   | Render HTML Certificate of Destruction with embedded QR code     |
| `serve`       | `web/app.py`              | Launch local Flask auditor dashboard                             |

### Usage Examples
```powershell
python wipelog.py wipe sandbox --create-samples   # create test files
python wipelog.py scan sandbox                    # pre-wipe AI scan
python wipelog.py wipe sandbox --yes              # execute wipe
python wipelog.py scan sandbox                    # post-wipe AI scan
python wipelog.py certify --label "Asset-001"     # issue certificate
python wipelog.py verify certificate.json --manifest manifest.json --ledger
python wipelog.py ledger show
python wipelog.py export-cert certificate.json --out report.html --open
python wipelog.py serve --port 5000
```

### Tested Output (Live Run)
```
Target: sandbox (5 files, 131,235 bytes)

Starting 3-pass overwrite (Random -> Ones -> Zero with fsync)...
  [1/5] PASS blob.bin (PASS, 0 flagged blocks)
  [2/5] PASS config.json (PASS, 0 flagged blocks)
  [3/5] PASS notes.txt (PASS, 0 flagged blocks)
  [4/5] PASS records.csv (PASS, 0 flagged blocks)
  [5/5] PASS zeros.dat (PASS, 0 flagged blocks)

Overwrite complete & 100% verified. Manifest saved to: manifest.json

Certificate Issued Successfully: certificate.json
  Certificate ID : ce096114-ab49-4e2d-8ca2-79ed0529c0f6
  Issuer Key ID  : 6c011ca46b6d14d5
  Ledger Entry   : #1 (ad05982581010958...)
  AI Verdict     : PASS

VALID: Cryptographic signature verified successfully!
  Erasure Result : CERTIFIED_ERASED (5 files)
  Ledger Status  : Chain Intact & Included

LEDGER VALID: chain intact
```

### Checklist
- [x] `wipelog wipe <target>` — Multi-pass file/directory overwrite with safety guards, zero read-back, manifest
- [x] `wipelog volume <drive>` — Windows volume & unallocated free-space sanitization
- [x] `wipelog image <file>` — Raw disk-image / block device sanitization with full zero read-back
- [x] `wipelog scan <target>` — Pre-wipe or post-wipe 4KB-block AI residual risk inspection
- [x] `wipelog certify` — Ed25519 sign, key fingerprint, ledger append
- [x] `wipelog verify <cert>` — Signature + manifest + ledger chain verification
- [x] `wipelog ledger [show|verify]` — Audit the hash-chained ledger
- [x] `wipelog export-cert` — Generate printable Certificate of Destruction
- [x] `wipelog serve` — Launch offline Flask auditor dashboard

---

## STEP 2 — Printable Certificate of Destruction (`python/cert_report.py`)

### Goal
Give compliance officers, IT asset recyclers, and non-technical auditors a human-readable,
printable, officially-styled Certificate of Destruction they can save as PDF and file.

### Design Decisions
- **Pure HTML + inline CSS — zero JS required**: The report is a single self-contained `.html` file.
  Browser `window.print()` handles PDF export natively. No server, no dependencies at render time.
- **SVG QR Code — no PIL/Pillow**: Used `qrcode[svg]` (`qrcode` library, `SvgPathImage` factory) to
  generate a pure `<svg>` element embedded directly into the HTML. The QR encodes:
  `Wipelog Cert: <cert_id>\nAsset: <label>\nStatus: CERTIFIED_ERASED\nIssuer: <key_id>\nManifest: <hash_prefix>`.
  Anyone with a phone camera can scan it and read the proof independently.
- **`@media print` CSS rule**: The "Print / Save as PDF" button and body background are hidden on print.
  Page margins, borders, and watermark render cleanly on A4 paper.
- **Graceful degradation**: If `qrcode` is not installed, a `[QR Generation Unavailable]` placeholder
  renders instead of crashing. The rest of the certificate is fully generated regardless.
- **`SANITIZED` watermark**: Large, rotated, near-zero-opacity CSS text element overlaid on the cert.
  Visible on screen but does not interfere with printed content.

### Certificate Sections

| Section                      | Contents                                                                                    |
|------------------------------|---------------------------------------------------------------------------------------------|
| Header                       | WIPELOG ASSURANCE PROTOCOL brand, Certificate of Destruction title, UUID cert_id            |
| Status Badge                 | Green `CERTIFIED ERASED` banner with issue timestamp                                        |
| Asset & Hardware Info        | Asset tag, hostname, OS (first segment), drive model, serial, bus interface                 |
| Sanitization Specifications  | Method, pass sequence, read-back result, item count, total bytes, fsync note               |
| AI Residual Verification     | Classifier verdict, total flagged blocks, worst block risk score (3 columns)                |
| Cryptographic Audit Evidence | Ed25519 algorithm, issuer key_id fingerprint, manifest SHA-256 (truncated), sig preview     |
| QR Code                      | Pure SVG, 110×110px, encodes cert_id + asset label + issuer fingerprint + manifest prefix   |
| Footer                       | NIST SP 800-88 / DoD 5220.22-M reference, "Page 1 of 1"                                    |

### New Dependency
- `qrcode==8.2` — added to `requirements.txt` (pure Python, no Pillow needed for SVG output)

### Usage
```powershell
# Via wipelog unified CLI
python wipelog.py export-cert certificate.json --out report.html --open

# Direct script
python python/cert_report.py certificate.json --out report.html --open
```

### Checklist
- [x] Self-contained HTML/PDF template (`python/cert_report.py`)
- [x] Asset & hardware section (label, hostname, OS, drive model, serial, bus)
- [x] Sanitization spec section (method, passes, read-back, file count, bytes, fsync)
- [x] AI residual verification section (verdict, flagged blocks, worst block risk)
- [x] Cryptographic evidence section (algo, key_id, manifest sha256, sig preview)
- [x] Embedded SVG QR code (no PIL/Pillow, pure qrcode[svg])
- [x] Print/Save PDF button (browser native `window.print()`, hidden on print media)
- [x] SANITIZED watermark + CERTIFIED ERASED badge
- [x] `@media print` CSS (clean A4 output, button hidden)
- [x] Graceful fallback if `qrcode` not installed
- [x] `export-cert` subcommand wired into `wipelog.py`
- [x] `qrcode==8.2` added to `requirements.txt`
- [x] `*report*.html` added to `.gitignore`

---

## STEP 3 — One-Click Live Demo Script (`demo.ps1`)

### Goal
A single `.\demo.ps1` command that runs the complete end-to-end pipeline with colorized
terminal output, suitable for live demonstration to technical judges and evaluators.

### Design Decisions
- **PowerShell (not Bash)**: Project is Windows-first. PS1 works natively without WSL or Git Bash.
  `ExecutionPolicy Bypass` flag allows running without system policy changes.
- **Non-interactive for CI, interactive for demo**: Script reads one `Read-Host` at the start
  (for a dramatic "press Enter to begin" pause). Every other stage runs automatically.
  CI/automated environments can `echo "" | powershell -File demo.ps1` to skip the pause.
- **`$ErrorActionPreference = "Stop"`**: Any Python subprocess failure halts the script.
  This prevents silent failures during live demo.
- **Regex-based tamper injection (not file-level)**: Stage 7 uses
  `[System.Text.RegularExpressions.Regex]::Replace` to increment `file_count` by +999
  in memory and writes `tampered.json`. This avoids touching the real `certificate.json`.
- **Ledger tamper test uses inline Python**: Rather than a separate Python script, Stage 7b
  uses `python -c` with a heredoc-style string to call `ledger.verify()` on a corrupted
  `ledger_fake.jsonl` copy. The fake file is deleted immediately after.
- **Summary table**: Final ASCII table summarizes all 8 stages with color-coded PASS/FAIL/status.

### Stages

| Stage | Label                                  | Expected Result                          |
|-------|----------------------------------------|------------------------------------------|
| 1     | Generate synthetic sensitive data      | 5 files created in `./sandbox`           |
| 2     | AI pre-wipe scan                       | FAIL — residual data in text files       |
| 3     | 3-pass overwrite + zero read-back      | 100% zero verified, manifest.json saved  |
| 4     | AI post-wipe scan                      | PASS — zero risk across all blocks       |
| 5     | Issue Ed25519 certificate + ledger     | certificate.json signed, ledger entry    |
| 6     | Independent cryptographic verification | VALID — sig + manifest + ledger all pass |
| 7a    | Tamper cert (file_count +999)          | INVALID — signature mismatch detected    |
| 7b    | Tamper ledger (cert_id corruption)     | LEDGER INVALID — hash chain broken       |
| 8     | Export printable destruction report    | certificate_report.html generated        |

### Runtime
~35–45 seconds end to end (dominated by 3-pass wipe + AI model loading).
Suitable for a single terminal window demo during a 3-minute slot.

### Usage
```powershell
# Interactive (press Enter to start)
.\demo.ps1

# Non-interactive / CI
echo "" | powershell -ExecutionPolicy Bypass -File demo.ps1
```

### Checklist
- [x] Stage 1: Generate synthetic sensitive files via `wipelog wipe --create-samples`
- [x] Stage 2: AI pre-scan table showing FAIL for plain-text files
- [x] Stage 3: 3-pass overwrite with per-file PASS output and manifest write
- [x] Stage 4: AI post-scan table showing PASS across all blocks
- [x] Stage 5: Certificate issuance with cert_id, key_id, ledger entry number
- [x] Stage 6: Full verification (signature + manifest SHA-256 + ledger chain)
- [x] Stage 7a: Certificate tamper via regex (+999 to file_count) → INVALID caught
- [x] Stage 7b: Ledger tamper via cert_id corruption → LEDGER INVALID caught
- [x] Stage 8: `export-cert` HTML report generation
- [x] Summary table with all 8 stages and color-coded status
- [x] Non-interactive mode supported (`echo "" | powershell -File demo.ps1`)
- [x] Cleanup: `tampered.json` and `ledger_fake.jsonl` deleted after each stage
