# AI-Verified Secure Data Wiping & Certification Tool
### Trustworthy IT Asset Recycling & Sanitization

A standards-inspired data sanitization engine and cryptographic verification tool. It securely overwrites files, virtual disk images, and whole storage volumes, validates data destruction with a 4KB-block machine-learning residual classifier + full zero read-back verification, and issues an **Ed25519 digitally signed erasure certificate** recorded into an append-only, tamper-evident hash-chained ledger.

Standard "delete" or "format" operations only remove partition tables and filesystem pointers; residual data remains fully recoverable via carving tools. This tool physically destroys data, verifies erasure, and generates independently auditable cryptographic proof.

---

## Architecture: Two-Tier System

| Component | Target Users | Capabilities & Scope |
|---|---|---|
| **Core CLI Engine** (`python/*.py`) | System Administrators, ITAD technicians | Unrestricted system-level operations: individual files, directories, whole Windows volumes (`volwipe.py` with free-space wipe), and raw disk images (`devwipe.py`). Full root guards and automated scripting. |
| **Auditor Web Portal** (`web/app.py`) | Compliance officers, recycling auditors, evaluators | Safe, self-contained offline Web UI (`http://127.0.0.1:5000`). Visualizes 4KB block risk heat-strips, displays before/after entropy metrics, allows one-click certificate issuing, and provides interactive tamper demos. Restricted to `./sandbox` for complete safety. |

---

## Key Features

- **Multi-pass Overwrite**: 3-pass overwrite (`Random` &rarr; `0xFF` &rarr; `0x00`) with explicit `fsync` flush after every pass to bypass OS file caching.
- **Full Zero Read-Back**: After the final zero pass, reads back every byte to guarantee 100% zero-fill before certification.
- **Volume & Free-Space Sanitization (Windows)**: Overwrites existing files, renames them with random hex tokens before unlinking, fills all unallocated slack space (random + zeros), verifies the entire free space, and removes temporary filler blocks (`volwipe.py`).
- **Per-Block AI Residual Classifier**: A 4 KB block-level Random Forest model (evaluating Shannon entropy, chi-square distribution, zero-byte fraction, printable ASCII ratio, and longest contiguous byte runs). Uses a strict **worst-block aggregation policy** so small un-wiped fragments cannot be masked by averaging.
- **File Signature Residual Scanner**: Catches surviving headers of formats whose internal payloads resemble high-entropy noise (ZIP/DOCX/XLSX, PDF, PNG, JPEG, SQLite, 7z, RAR, OLE).
- **Cryptographic Certification**: Generates canonical JSON signed with **Ed25519** asymmetric cryptography, embedding drive hardware serials, timestamps, AI block scores, and an issuer public key fingerprint (`key_id`).
- **Append-Only Hash-Chained Ledger**: Every issued certificate is committed to an immutable ledger (`ledger.jsonl`) where each entry incorporates the SHA-256 hash of the previous record ($H_n = \text{SHA-256}(E_n + H_{n-1})$). Tampering with any historical entry invalidates the entire chain.
- **Hard Safety Guardrails**: Hardcoded rejection of drive roots, system roots (`C:\Windows`, `SystemRoot`, `Program Files`, `/usr`, `/etc`), the current project directory, the host drive, and directory symlinks.

---

## How It Works

```
Target Storage (Files / Directory / Disk Image / Drive Volume)
        │
        ▼
  Secure Multi-Pass Overwrite: Random ──► 0xFF ──► 0x00 (fsync each pass)
        │
        ▼
  Read-Back Check (All-Zero) + Per-4KB Block AI Residual Scan + Signature Scan
        │
        ▼
  manifest.json (Cryptographic digests, per-block risk array, hardware info)
        │
        ▼
  certificate.json (Ed25519 Signed) ──► ledger.jsonl (Hash-Chained Audit Trail)
        │
        ▼
  Independent Verification (verify_cert.py: Signature + Manifest + Ledger Chain)
```

---

## Installation & Setup

### Requirements
- Python 3.10+ (tested on Python 3.11/3.12, Windows 10/11)
- Windows required for `volwipe.py` (Volume wipe). `wipe.py`, `devwipe.py`, classifier, certification, and Web UI work on any OS.
- PowerShell with Administrator rights for physical volume operations.

```powershell
# 1. Clone repository
git clone https://github.com/ctrl-Nix/Wipelog.git
cd Wipelog

# 2. Virtual environment setup
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt

# 3. Train the AI model (generates local python/model.joblib)
cd python
..\.venv\Scripts\python.exe train.py
cd ..
```

---

## Quick Start (Interactive Evaluator Demo)

### Option A: Local Auditor Web Dashboard
Launch the self-contained Flask dashboard with browser auto-open:
```powershell
.\run_ui.ps1
```
Or manually:
```powershell
.venv\Scripts\python.exe web\app.py
```
Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)**:
1. **Step 1: Target Selection**: Click *"Create Sample Files"* to populate `./sandbox` with test data (confidential docs, financial CSVs, DB dumps).
2. **Step 2: AI Pre-Scan**: View the red **FAIL (Residual Data)** flags and high-risk entropy blocks before wiping.
3. **Step 3: Secure Wipe**: Type `WIPE` to execute multi-pass overwrite. Watch real-time pass updates and observe the post-wipe transition to solid green **PASS** with zero read-back confirmation.
4. **Step 4: Certify & Audit**: Issue a signed Ed25519 certificate, inspect the auto-recorded ledger entry, and click *"Run Tamper Demo"* to witness immediate cryptographic rejection upon single-byte tampering.

---

### Option B: Command-Line Operations

#### 1. File & Directory Overwrite
```powershell
# Generate test files in ./sandbox
.venv\Scripts\python.exe python\wipe.py --create-samples

# Run pre-wipe AI scan
.venv\Scripts\python.exe python\classifier.py sandbox

# Dry-run inspection
.venv\Scripts\python.exe python\wipe.py --target sandbox --dry-run

# Execute multi-pass wipe + zero read-back (type WIPE to confirm, or pass --yes)
.venv\Scripts\python.exe python\wipe.py --target sandbox --delete --yes --out manifest.json
```

#### 2. Whole Volume Wipe (Windows USB / External Drive)
```powershell
# Check assigned drive letter
Get-Volume

# Overwrite volume files, delete, fill all free space (random + zero), and verify
.venv\Scripts\python.exe python\volwipe.py E
```
*(Removable media accepted by default. External fixed drives require `--allow-fixed`. System drives and the project repository drive are permanently refused).*

#### 3. Raw Disk Image Overwrite
```powershell
.venv\Scripts\python.exe python\devwipe.py disk.img
```

#### 4. Issue & Independently Verify Certificate
```powershell
# Issue certificate (signs with keys/private.pem, commits to ledger.jsonl)
.venv\Scripts\python.exe python\certificate.py --manifest manifest.json --label "Asset-0001" --out certificate.json

# Independent verification (verifies against keys/public.pem, checks manifest hash, checks ledger)
.venv\Scripts\python.exe python\verify_cert.py certificate.json --manifest manifest.json --ledger

# Inspect ledger audit chain
.venv\Scripts\python.exe python\ledger.py show
.venv\Scripts\python.exe python\ledger.py verify
```

---

## Tamper-Evidence Demonstration

The verifier detects any modification to the certificate, manifest, or ledger:

```powershell
# Test 1: Tampered certificate payload
(Get-Content certificate.json -Raw) -replace '"file_count": 2', '"file_count": 1' | Set-Content tampered.json
.venv\Scripts\python.exe python\verify_cert.py tampered.json
# Result -> INVALID: signature mismatch, certificate was modified

# Test 2: Mismatched manifest digest
Copy-Item manifest.json manifest_fake.json; Add-Content manifest_fake.json " "
.venv\Scripts\python.exe python\verify_cert.py certificate.json --manifest manifest_fake.json
# Result -> INVALID: manifest does not match the certificate

# Test 3: Broken ledger hash-chain
(Get-Content ledger.jsonl -Raw) -replace '"cert_id": "', '"cert_id": "x' | Set-Content ledger_fake.jsonl
.venv\Scripts\python.exe python\ledger.py verify ledger_fake.jsonl
# Result -> LEDGER INVALID: entry 0 was modified (hash chain broken)
```

---

## Forensic Validation (Virtual Hard Disk Experiment)

To validate physical zero-fill beyond OS filesystem tables, tests were conducted on a 128 MB raw Virtual Hard Disk (VHD) mounted as `V:`. A distinctive 8-byte ASCII marker string was populated 3,000 times across partition sectors:

```
[Raw VHD Search via python/vhd_search.py]
  Stage 1: File created (Baseline)           ->  3,000 marker instances detected
  Stage 2: Standard Windows Delete / Recycle ->  3,000 marker instances detected (pointers removed, raw data intact)
  Stage 3: Post volwipe.py Execution         ->      0 marker instances detected (100% forensic elimination)
```

---

## Safety Guardrails

To prevent catastrophic system damage or accidental operator error:
- **Root Protection**: Blocks wiping of `C:\`, `/`, `C:\Windows`, `Program Files`, `ProgramData`, `/usr`, `/bin`, `/etc`.
- **Self-Protection**: Prohibits wiping the repository root, parent directories, or any module path.
- **Drive Exclusion**: `volwipe.py` unconditionally blocks execution against the active operating system partition (`SystemDrive`) and the drive hosting this repository.
- **Symlink Boundary**: Refuses symlinks and never traverses external link targets.
- **Explicit Confirmation**: Requires manual interactive typing (`WIPE`, drive letter, or target byte size) unless explicitly bypassed via `--yes`.

---

## Project Structure

```
Wipelog/
├── python/
│   ├── wipe.py          # Multi-pass file/directory overwrite engine
│   ├── volwipe.py       # Whole-volume + free-space sanitization (Windows)
│   ├── devwipe.py       # Raw block device / disk image overwriter
│   ├── classifier.py    # 4KB block ML risk scanner & file signature detector
│   ├── features.py      # Statistical feature extraction (entropy, runs, chi-square)
│   ├── synth.py         # Synthetic training data generator
│   ├── train.py         # Random Forest training script (outputs model.joblib)
│   ├── certificate.py   # Canonical JSON builder & Ed25519 signer
│   ├── verify_cert.py   # Independent cryptographic & ledger verifier
│   ├── ledger.py        # Append-only hash-chained ledger manager
│   └── vhd_search.py    # Raw binary disk search tool for validation
├── web/
│   ├── app.py           # Self-contained Flask backend (REST API & sandboxed execution)
│   ├── templates/       # Auditor UI templates
│   └── static/          # CSS/JS visualizers (heat-strips, live progress)
├── tests/               # Pytest suite covering safety guards, classification, and certs
├── keys/                # Cryptographic keypair storage (public.pem; private.pem is gitignored)
├── requirements.txt     # Pinned Python dependencies
└── run_ui.ps1           # Quick launch script for Auditor Dashboard
```

---

## Threat Model & Boundary Conditions

### Covered Threats
- File recovery via filesystem carving or raw sector analysis.
- Unallocated free-space slack data remnants on mechanical and formatted volumes.
- Digital certificate forgery or post-issuance modification.
- Retroactive tampering with historical audit trail records.

### Boundary Limitations (Flash Memory Notice)
- **Solid State Disks (SSDs/NVMe) & USB Flash**: Modern flash devices utilize Flash Translation Layers (FTL), dynamic wear leveling, and over-provisioned spare blocks. Software-level overwriting addresses logical LBAs but may not touch retired physical NAND cells. For internal solid-state media, firmware-level commands (ATA Secure Erase / NVMe Sanitize) or cryptographic erasure are recommended.
- **Copy-on-Write & Snapshots**: Journaling filesystems, Volume Shadow Copies (VSS), and CoW snapshots (Btrfs, ZFS) can retain previous block states outside active extents if not unmounted/purged prior to sanitization.

---

## License & Attribution
All components are designed for transparent, independently verifiable, and safe electronic asset disposition.