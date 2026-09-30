# Wipelog: AI-Verified Secure Data Erasure & Cryptographic Certification

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Security: Ed25519](https://img.shields.io/badge/Security-Ed25519%20%2B%20SHA256-green.svg)]()
[![Platform: Windows / Cross-Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)]()

**Wipelog** is an enterprise-grade forensic data sanitization and certification engine. It performs multi-pass physical overwriting on files, disk images, and volume free-space, verifies data destruction using a 4KB-block machine-learning residual classifier + 100% zero read-back check, issues **Ed25519 digitally signed certificates of destruction**, and commits cryptographic audit logs to an **append-only, hash-chained ledger**.

---

## Technical Overview & Data Flow

```
                     ┌─────────────────────────────────────────┐
                     │ Storage Target (Files / VHD / Volume)  │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │ 3-Pass Overwrite (DoD 5220.22-M style)  │
                     │  Pass 1: Pseudorandom bytes             │
                     │  Pass 2: 0xFF all-ones                  │
                     │  Pass 3: 0x00 all-zeros                 │
                     │  * fsync() called after every pass      │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │ Verification & Risk Scanning            │
                     │  1. 100% Zero Read-Back Check           │
                     │  2. 4KB Block ML Classifier (Entropy,   │
                     │     Chi-Sq, Zero Frac, Runs, ASCII)     │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │ Erasure Manifest (manifest.json)        │
                     │  Contains block risk array, file hashes,│
                     │  device metadata & serial numbers       │
                     └────────────────────┬────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │ Cryptographic Certification             │
                     │  1. Ed25519 Asymmetric Signature        │
                     │  2. Immutable Ledger Entry (SHA-256)    │
                     │  3. Printable HTML/PDF Report + SVG QR  │
                     └─────────────────────────────────────────┘
```

---

## Core Features

- **Multi-Pass Hardware Overwrite**: 3-pass sanitization pattern (`Random` $\rightarrow$ `0xFF` $\rightarrow$ `0x00`) with explicit kernel file buffer flushes (`fsync()`) to bypass OS write caches.
- **Zero Read-Back Verification**: Verifies every sector byte against `0x00` following the final pass to guarantee zero storage retention.
- **Volume & Free-Space Sanitization (Windows)**: Overwrites existing volume contents, renames files to randomized hex strings before unlinking, fills all unallocated slack space, and purges temporary allocation blocks (`volwipe`).
- **4KB-Block AI Residual Classifier**: Random Forest ML model evaluating Shannon entropy, Chi-square distribution, zero-byte ratio, printable ASCII fraction, and longest contiguous byte runs. Uses a **worst-block aggregation policy** to ensure localized data fragments are never masked by averaging.
- **Ed25519 Signed Certificates**: Asymmetric cryptographic signing of canonical JSON manifests containing device serial numbers, host details, block risk statistics, and issuer key fingerprints (`key_id`).
- **Append-Only Hash-Chained Ledger**: Immutable ledger (`ledger.jsonl`) where entry $n$ includes the hash of entry $n-1$:
  $$\text{EntryHash}_n = \text{SHA-256}(\text{Payload}_n \mathbin{\Vert} \text{EntryHash}_{n-1})$$
  Modifying any historical entry breaks the entire downstream chain.
- **Printable Certificate of Destruction**: Single-file self-contained HTML report with embedded SVG QR codes, `@media print` styling, and native browser PDF generation (`export-cert`).
- **Strict Safety Guardrails**: Permanent hardcoded rejection of system roots (`C:\`, `/`, `C:\Windows`, `Program Files`, `/usr`, `/etc`), parent repo boundaries, host system partitions, and symbolic links.

---

## Quickstart: 30-Second Live Demonstration

Run the automated 8-stage interactive demo script:

```powershell
.\demo.ps1
```

**Demo Pipeline Stages:**
1. **Setup**: Generates synthetic sensitive test files in `./sandbox`.
2. **AI Pre-Scan**: Evaluates 4KB blocks and flags plain-text files (**FAIL**).
3. **Multi-Pass Overwrite**: Overwrites target files with 3 passes + `fsync()` and verifies zero read-back.
4. **AI Post-Scan**: Re-scans overwritten blocks (**PASS — Zero Residual Risk**).
5. **Certify & Ledger**: Signs manifest with Ed25519 and appends record to `ledger.jsonl`.
6. **Verification**: Validates signature authentic, manifest matches, and ledger chain intact (**VALID**).
7. **Tamper Test**: Modifies payload bytes and ledger history to demonstrate instant rejection (**INVALID**).
8. **Export Report**: Renders official `certificate_report.html` with SVG QR code.

---

## Unified Command-Line Interface (`wipelog.py`)

All engine capabilities are consolidated under a single CLI utility:

```
usage: wipelog <command> [options]

Commands:
  wipe         Multi-pass file/directory overwrite with zero read-back
  volume       Windows volume & unallocated free space sanitization
  image        Raw disk image or block device overwrite
  scan         Pre/post-wipe 4KB-block AI residual risk scanner
  certify      Sign erasure manifest with Ed25519 and record in ledger
  verify       Verify certificate signature, manifest digest, and ledger
  ledger       Inspect or verify the append-only hash-chained ledger
  export-cert  Generate printable HTML/PDF Certificate of Destruction
  serve        Launch local offline auditor web dashboard
```

### CLI Command Examples

#### 1. File & Folder Sanitization
```powershell
# Create test sample files in sandbox/
python wipelog.py wipe sandbox --create-samples

# Run multi-pass wipe + zero read-back + manifest generation
python wipelog.py wipe sandbox --delete --yes --out manifest.json
```

#### 2. AI Residual Risk Scanning
```powershell
python wipelog.py scan sandbox
```

#### 3. Certificate Issuance & Ledger Entry
```powershell
python wipelog.py certify --manifest manifest.json --label "Asset-001" --out certificate.json
```

#### 4. Cryptographic Verification
```powershell
python wipelog.py verify certificate.json --manifest manifest.json --ledger
```

#### 5. Audit Ledger Management
```powershell
# Show all ledger entries
python wipelog.py ledger show

# Verify hash-chain integrity
python wipelog.py ledger verify
```

#### 6. Export Printable Certificate of Destruction
```powershell
python wipelog.py export-cert certificate.json --out certificate_report.html --open
```

#### 7. Windows Volume & Free-Space Sanitization (Admin Required)
```powershell
python wipelog.py volume E: --yes
```

---

## Local Auditor Web Dashboard

Launch the offline web dashboard for visual audit demonstrations:

```powershell
python wipelog.py serve --port 5000
```
Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)** to access:
- **Interactive Target Selection**: Sandboxed file wiping and sample generator.
- **Real-Time Block Heat-Strips**: Visual 4KB entropy block color indicators (Red = Data, Green = Zero/Erased).
- **One-Click Certification**: Issuance and visual ledger audit inspection.
- **Interactive Tamper Demo**: Live single-byte corruption test triggering visual warning alerts.

---

## Forensic Validation: Virtual Hard Disk (VHD) Sector Analysis

To verify physical zero-fill beyond OS file allocation tables, tests were conducted on a 128 MB raw Virtual Hard Disk (VHD) mounted as `V:`. A specific 8-byte ASCII test pattern was written 3,000 times across partition sectors:

| Stage | Action | Sector Marker Instances Detected |
|---|---|---|
| **Baseline** | File created on VHD partition | **3,000 instances** |
| **Standard Delete** | Standard OS Delete / Recycle Bin empty | **3,000 instances** *(filesystem pointer removed, data intact)* |
| **Wipelog Volume Wipe** | Executed `wipelog volume V:` | **0 instances** *(100% forensic sector elimination)* |

---

## Threat Model & Boundary Conditions

### Covered Threats
- File recovery via filesystem carving, un-delete utilities, or raw sector read tools.
- Unallocated free-space slack data remnants on formatted volumes.
- Digital certificate forgery or post-issuance payload modification.
- Historical audit trail alteration or ledger entry insertion/deletion.

### Physical Media Limitations (Solid State Drives & Flash Storage)
- **FTL & Wear-Leveling**: Modern NVMe/SATA SSDs and USB flash drives utilize Flash Translation Layers (FTL), dynamic wear-leveling algorithms, and over-provisioned block pools. Logical sector overwrites target mapped LBAs but may not touch retired physical NAND cells. For internal SSDs, firmware-level commands (`ATA Secure Erase`, `NVMe Sanitize`) or full-disk encryption keys (Cryptographic Erasure / Crypto-Erase) should complement software overwriting.
- **Copy-on-Write (CoW) Filesystems**: Journaling filesystems, Volume Shadow Copies (VSS), or snapshot filesystems (Btrfs, ZFS) can preserve previous block revisions outside active allocations unless snapshots are unmounted and purged before sanitization.

---

## Repository Structure

```
Wipelog/
├── wipelog.py           # Master CLI entry point (subcommands: wipe, volume, image, scan, etc.)
├── demo.ps1             # 8-stage automated interactive demonstration script
├── cert_report.py       # Standalone HTML report generator with embedded SVG QR codes
├── python/
│   ├── wipe.py          # Multi-pass file overwrite engine with zero read-back
│   ├── volwipe.py       # Windows volume & free-space sanitization module
│   ├── devwipe.py       # Raw block device / disk image overwriter
│   ├── classifier.py    # 4KB block Random Forest ML risk scanner
│   ├── features.py      # Statistical feature extraction (entropy, chi-sq, runs)
│   ├── synth.py         # Synthetic training data generator
│   ├── train.py         # AI model training script (outputs model.joblib)
│   ├── certificate.py   # Canonical JSON builder & Ed25519 signer
│   ├── verify_cert.py   # Cryptographic signature & ledger verifier
│   ├── ledger.py        # Append-only hash-chained ledger manager
│   └── vhd_search.py    # Raw sector binary scanner for VHD validation
├── web/
│   ├── app.py           # Local Flask auditor server
│   ├── templates/       # Auditor UI templates
│   └── static/          # CSS/JS visualizers (block heat-strips, live progress)
├── keys/                # Cryptographic keypair storage (public.pem; private.pem gitignored)
├── requirements.txt     # Pinned Python dependencies (includes qrcode==8.2)
└── TODO.md              # Feature roadmap & implementation documentation
```

---

## License

This project is released under the **MIT License**.