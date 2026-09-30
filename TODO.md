# Wipelog Enhancement Roadmap & Next Steps

This document outlines the three planned enhancements to elevate **Wipelog** into an enterprise-grade, pitch-ready data sanitization and certification suite.

---

## 1. Unified Single CLI (`python wipelog.py`)
Consolidate all separate Python utilities (`wipe.py`, `volwipe.py`, `devwipe.py`, `certificate.py`, `verify_cert.py`, `ledger.py`, and `web/app.py`) into a single, cohesive command-line tool with intuitive subcommands:

- [x] **`wipelog wipe <target>`**: Multi-pass file/directory overwrite with safety guards, zero read-back, and manifest generation (`--dry-run`, `--delete`, `--yes`, `--out`).
- [x] **`wipelog volume <drive>`**: Windows volume & unallocated free-space sanitization (`--allow-fixed`, `--yes`).
- [x] **`wipelog image <file>`**: Raw disk-image / block device sanitization with full zero read-back.
- [x] **`wipelog scan <target>`**: Pre-wipe or post-wipe 4KB-block AI residual risk inspection.
- [x] **`wipelog certify`**: Generate canonical JSON, sign with Ed25519, attach device metadata, and commit to hash-chained ledger (`--manifest`, `--label`, `--out`).
- [x] **`wipelog verify <cert>`**: Independently verify cryptographic signature, manifest hash matching, and ledger chain integrity (`--manifest`, `--ledger`).
- [x] **`wipelog audit`**: View full immutable ledger history or verify hash-chain validity (`show`, `verify`).
- [x] **`wipelog serve`**: Launch the local offline web auditor dashboard on `http://127.0.0.1:5000`.

---

## 2. Exportable & Printable Certificate of Destruction (HTML / PDF)
Provide compliance officers, recyclers, and auditors with an official, human-readable **Certificate of Destruction**:

- [ ] **Self-Contained HTML/PDF Template**: Beautiful, printable single-file layout containing:
  - Official Certificate ID & Issuance Timestamp.
  - Sanitized Asset Details (Device Label, Hostname, Drive Model, Serial Number, Bus Type).
  - Sanitization Method & Passes (`DoD 5220.22-M` inspired, 100% Zero Read-Back Verified).
  - 4KB Block AI Residual Analysis Summary (Verdict: PASS, 0 Flagged Blocks).
  - Cryptographic Verification Details (Ed25519 Signature, Issuer `key_id` Fingerprint, Manifest SHA-256 Digest).
  - Embedded SVG/Canvas QR Code encoding verification link / digest for mobile scanning.
- [ ] **CLI & Web Export Support**: Exportable via CLI (`python wipelog.py export-cert certificate.json --out cert.html`) and as a "Print / Save PDF" button on the Web UI.

---

## 3. One-Click Automated Demo Script (`demo.ps1`)
An interactive, automated PowerShell script tailored for live demonstrations to technical judges, evaluators, and stakeholders (~25 seconds runtime):

- [ ] **Stage 1 (Setup)**: Generates synthetic sensitive test files in `./sandbox` (financial data, passwords, DB dumps).
- [ ] **Stage 2 (AI Pre-Scan)**: Runs 4KB block classifier showing **RED FAIL (Residual Data Detected)**.
- [ ] **Stage 3 (Secure Overwrite)**: Executes multi-pass overwrite with real-time progress & confirms 100% zero read-back.
- [ ] **Stage 4 (AI Post-Scan)**: Re-scans wiped blocks showing transition to solid **GREEN PASS (Zero Residual Risk)**.
- [ ] **Stage 5 (Certification & Ledger)**: Generates Ed25519 signature, extracts issuer key fingerprint, and appends record to hash-chained ledger.
- [ ] **Stage 6 (Cryptographic Verification)**: Verifies certificate signature, manifest digest, and ledger chain integrity (**VALID**).
- [ ] **Stage 7 (Tamper Demonstration)**: Modifies 1 byte in memory and demonstrates instant cryptographic rejection (**INVALID: Signature Mismatch / Ledger Broken**).
