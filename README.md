# AI-Verified Secure Data Wiping & Certification Tool

A local, offline-capable file wiping and cryptographic certification engine. Inspired by **DoD 5220.22-M** multi-pass overwrite (0x00, 0xFF, Random), paired with a **Random Forest AI residual pattern classifier** analyzing 4KB blocks and **Ed25519 asymmetric signature certification**.

> **Note on Existing Frontends**: This repository contains both the Next.js frontend (`app/`) and the standalone, self-contained Python Flask local Web UI (`web/app.py`).

---

## 1. Environment Setup

The tool operates with Python 3.11+ using the project virtual environment `.venv`.

```powershell
# Clone or open repository
cd C:\dev\gdgproject

# Activate existing virtual environment
.venv\Scripts\Activate.ps1

# Install / verify pinned dependencies
pip install -r requirements.txt
```

---

## 2. Running via CLI

### Step 2.1: Generate Sample Data in Sandbox
```powershell
.venv\Scripts\python.exe python\wipe.py --create-samples
```

### Step 2.2: Execute Secure Multi-Pass Overwrite
```powershell
.venv\Scripts\python.exe python\wipe.py --target sandbox --yes --out manifest.json
```

### Step 2.3: Issue Cryptographically Signed Certificate
```powershell
.venv\Scripts\python.exe python\certificate.py --manifest manifest.json --label "Demo-Laptop-01" --out certificate.json
```

### Step 2.4: Verify Certificate Independently
```powershell
.venv\Scripts\python.exe python\verify_cert.py certificate.json --manifest manifest.json
```

---

## 3. Running the Local Web UI

The Web UI binds strictly to `127.0.0.1:5000` (`debug=False`), operates completely offline without external CDNs, and restricts wiping strictly to `sandbox/`.

### Quick Start via PowerShell:
```powershell
.\run_ui.ps1
```

### Or manually:
```powershell
.venv\Scripts\Activate.ps1
python web\app.py
```
Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)** in your browser.

---

## 4. 10-Step End-to-End Demo Script

Follow these 10 steps to demonstrate the tool from scratch:

1. **Launch the Web UI**: Run `.\run_ui.ps1` and open `http://127.0.0.1:5000`.
2. **Create Sample Files**: In **Step 1**, click **"Create Sample Files"** to populate `sandbox/` with realistic text, CSV, and JSON dummy data.
3. **Select Allowlisted Target**: Select `Entire Sandbox (all files)` from the target dropdown and click **"Proceed to AI Pre-Scan"**.
4. **Execute Pre-Wipe AI Scan**: In **Step 2**, click **"Run Pre-Wipe AI Scan"**. Observe the red **FAIL (Residual Data)** badges indicating high-probability un-erased content.
5. **Proceed to Secure Wipe**: Click **"Proceed to Secure Wipe"** to navigate to Step 3.
6. **Safety Confirmation**: Notice the Execute button is disabled until you type `WIPE` in the confirmation input box. Optionally check or uncheck "Delete files after overwrite".
7. **Run Overwrite & Live Progress**: Click **"Execute Secure Wipe"**. Watch the live phase transition: `scan_before` &rarr; `overwrite` (3 passes) &rarr; `scan_after`.
8. **Analyze Before vs After Comparison**:
   - Confirm all files now show a green **PASS** verdict.
   - Observe the 4KB-block AI risk heat-strip showing dramatic reduction from red/amber to solid green.
   - Check the differing SHA-256 before and after digests.
9. **Issue Signed Certificate**: In **Step 4**, enter asset tag label (e.g. `Demo-PC-01`) and click **"Issue Signed Certificate"**. Inspect the green **CERTIFIED ERASED** badge, UUID, device metadata, and download the resulting `certificate.json`.
10. **Verify & Tamper Detection**:
    - Upload `certificate.json` and click **"Verify Certificate"** &rarr; see green **VALID: signature verified**.
    - Click **"Run Tamper Demo"** &rarr; witness an instant in-memory tamper simulation fail with **INVALID: signature mismatch, certificate was modified**.

---

## 5. Security Guardrails

1. **Strict Target Sandbox Allowlist**: The server validates all paths using `check_target()`. Any attempt to wipe system roots (`C:\Windows`, `C:\Program Files`), user folders (`C:\Users`), the project root, or source code directories is unconditionally rejected with HTTP 400.
2. **No Arbitrary Path Inputs**: The browser never sends raw absolute filesystem paths. Targets are resolved exclusively relative to `sandbox/`.
3. **Single-Worker Execution Lock**: Overwrites are mutually exclusive; concurrent wipe requests return HTTP 409.
4. **Key Isolation**: `keys/private.pem` is kept isolated on the server and is never exposed or logged.
5. **Safe File Serving**: The download endpoints strictly verify and restrict file access to `outputs/<job_id>/`.

---

## 6. Technical Limitations & SSD Boundary Notice

> **Prototype Notice: File-level overwrite. SSD limits apply.**

- **Flash Translation Layer (FTL) & Wear Leveling**: On modern solid-state drives (SSDs) and NVMe storage, logical block addresses do not map 1:1 to physical NAND flash cells. File-level overwriting modifies the currently assigned physical blocks, but wear-leveling algorithms or reserve blocks may retain stale data until garbage collection cycles execute.
- **Over-Provisioning & TRIM**: Full sanitization of non-volatile solid-state drives requires firmware-level ATA Secure Erase, NVMe Format / Sanitize commands, or hardware cryptographic erasure.
- **OS File System Journaling & Shadow Copies**: Copy-on-Write (CoW) filesystems (such as Btrfs, ZFS) and NTFS Volume Shadow Copies (VSS) can maintain prior versions of modified sectors outside the file's current extent.
