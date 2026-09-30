# AI-Verified Secure Data Wiping & Certification Tool

A command-line tool that securely overwrites files, folders, disk images and whole volumes, checks the result with a machine-learning classifier, and issues a cryptographically signed erasure certificate that is recorded in a tamper-evident ledger.

Deleting or formatting does not remove data. This tool overwrites it, verifies the overwrite, and produces evidence that anyone can check independently.

## Features

- **Multi-pass overwrite**: random, 0xFF, then 0x00, with `fsync` after every pass.
- **Read-back verification**: after the final zero pass, the data is read back and every byte must be zero.
- **Volume wipe (Windows)**: overwrites every file, deletes it, then fills free space with random data and then zeros, and verifies the free space by read-back.
- **Per-block AI verification**: a Random Forest scores every 4 KB block for residual data. The verdict for a file is decided by its worst block, so a small surviving region is not averaged away.
- **File-signature scan**: catches leftover headers of formats whose payload looks random (ZIP/DOCX, PDF, PNG, JPEG, SQLite, RAR, 7z, OLE).
- **Signed certificate**: Ed25519 signature over canonical JSON. Includes drive model/serial, method, per-file results, manifest hash and issuer key fingerprint.
- **Hash-chained ledger**: append-only log where each entry contains the hash of the previous one. Editing any past entry breaks the chain.
- **Safety guards**: refuses system folders, the system drive, the drive holding the project, the project's own source, drive roots and symlinks.

## How it works

```
target (file / folder / image / drive)
        |
        v
  overwrite: random -> 0xFF -> 0x00 (fsync each pass)
        |
        v
  read-back check (all zero)  +  per-4KB-block AI scan  +  signature scan
        |
        v
  manifest.json  (hashes, block scan, drive info, timestamps)
        |
        v
  certificate.json  (Ed25519 signed)  ->  ledger.jsonl (hash chain)
        |
        v
  verify_cert.py  (signature, manifest match, ledger inclusion)
```

| Stage | Method |
|---|---|
| Wipe | 3 passes with `fsync`; final pass zeros verified by read-back |
| Free space | Random fill then zero fill, verified, filler files removed |
| AI verify | Random Forest on entropy, chi-square, zero fraction, printable ratio and longest run, scored per 4 KB block |
| Certificate | Canonical JSON signed with Ed25519; verifier trusts only the issuer public key |
| Ledger | JSONL, `entry_hash = SHA-256(entry + prev_hash)` |

## Requirements

- Python 3.10 or newer
- Windows for `volwipe.py` (volume wipe). `wipe.py`, `devwipe.py` on image files, and the certificate tools work on any OS.
- Administrator PowerShell for drive wipes.

## Installation

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
cd python
..\.venv\Scripts\python.exe train.py
cd ..
```

`model.joblib` is not committed, so `train.py` must be run once after cloning.

## Usage

### 1. Wipe files or a folder

```powershell
.venv\Scripts\python.exe python\wipe.py --create-samples          # optional test files in .\sandbox
.venv\Scripts\python.exe python\classifier.py sandbox             # scan before wiping
.venv\Scripts\python.exe python\wipe.py --target sandbox --dry-run
.venv\Scripts\python.exe python\wipe.py --target sandbox          # type WIPE to confirm
.venv\Scripts\python.exe python\wipe.py --target sandbox --delete --yes
```

| Flag | Meaning |
|---|---|
| `--target` | File or folder to wipe |
| `--dry-run` | List what would be wiped, change nothing |
| `--delete` | Remove files after overwriting (names are randomised before unlink) |
| `--yes` | Skip typed confirmation |
| `--out` | Manifest path (default `manifest.json`) |

### 2. Wipe a whole volume (Windows, Administrator)

```powershell
Get-Volume                                           # confirm the drive letter first
.venv\Scripts\python.exe python\volwipe.py E
```

Removable drives are accepted by default. External fixed drives need `--allow-fixed`. The system drive and the drive holding this project are always refused.

### 3. Wipe a disk image

```powershell
.venv\Scripts\python.exe python\devwipe.py disk.img
```

Overwrites the entire image and read-back verifies every byte. Block-device mode exists for Linux and refuses any disk with mounted partitions, but it has not been validated on physical hardware.

### 4. Issue and verify a certificate

```powershell
.venv\Scripts\python.exe python\certificate.py --label "Asset-0001"
.venv\Scripts\python.exe python\verify_cert.py certificate.json --manifest manifest.json --ledger
.venv\Scripts\python.exe python\ledger.py show
.venv\Scripts\python.exe python\ledger.py verify
```

A certificate is refused unless every file passed the AI scan and the read-back check. The first run generates a keypair in `keys/`. Keep `keys/private.pem` secret; publish `keys/public.pem` so others can verify your certificates.

### 5. Tamper checks

Each of these must be detected:

```powershell
# modified certificate field
(Get-Content certificate.json -Raw) -replace '"file_count": 2','"file_count": 1' | Set-Content tampered.json
.venv\Scripts\python.exe python\verify_cert.py tampered.json
# INVALID: signature mismatch, certificate was modified

# modified manifest
Copy-Item manifest.json manifest_fake.json; Add-Content manifest_fake.json " "
.venv\Scripts\python.exe python\verify_cert.py certificate.json --manifest manifest_fake.json
# INVALID: manifest does not match the certificate

# modified ledger
(Get-Content ledger.jsonl -Raw) -replace '"cert_id": "','"cert_id": "x' | Set-Content ledger_fake.jsonl
.venv\Scripts\python.exe python\ledger.py verify ledger_fake.jsonl
# LEDGER INVALID: entry 0 was modified
```

## Certificate contents

- Certificate ID, issue time, issuer `key_id` (public key fingerprint)
- Device label, hostname, OS
- Drive model, serial, bus type and filesystem (volume wipes)
- Method, passes, start/end time, file count, bytes
- Per-file SHA-256 before and after, AI verdict, flagged blocks, worst block risk, read-back result
- Free-space bytes verified (volume wipes)
- SHA-256 of the manifest
- Ed25519 signature

## Validation

The volume wipe was tested on a 128 MB virtual disk (VHD) mounted as `V:`. A marker string was written 3000 times, and the raw VHD file was searched for it at each stage using `python/vhd_search.py`.

| Stage | Marker hits in raw disk |
|---|---|
| File present (control) | 3000 |
| After a normal delete | 3000 |
| After `volwipe.py` | **0** |

The guard also refused the system drive, and a fixed drive without `--allow-fixed`. Whole-image wipe and read-back were checked on a 64 MB image file (5000 hits before, 0 after).

Not yet tested: physical USB flash, SD cards, HDDs and SSDs.

## Safety guards

- Refuses drive roots and top-level folders, `SystemRoot`, `ProgramFiles`, `ProgramData` and common Unix system paths.
- Refuses the project root, its parents, and its own source folders.
- Refuses symlinks and does not follow them while walking folders.
- Volume wipe refuses the system drive and the project drive, and requires typing the drive letter.
- Block-device wipe refuses any disk with a mounted partition and requires an explicit long flag.

## Threat model

**Covered**
- Recovery of deleted, partially overwritten or residual file content using file-level and raw-image search tools.
- Tampering with a certificate, its manifest, or past ledger entries.
- A forged certificate signed with a different key (the verifier trusts only the known issuer key).

**Not covered**
- Physical flash cells on SSD/NVMe/USB (wear levelling, over-provisioning, remapped blocks).
- Filesystem journals, file-name metadata, and temporary copies made by other programs.
- An issuer whose private key is compromised.
- Trusted time: timestamps come from the local system clock.
- Proof that the wipe ran on a specific physical device. The certificate records what the operating system reported.

## Limitations

- Overwrite-based erasure is not guaranteed on flash storage. For internal SSDs and NVMe drives use ATA Secure Erase, NVMe Sanitize or cryptographic erase. These are not implemented here.
- The classifier is trained on synthetic wipe outcomes, so its near-perfect accuracy reflects easy classes and is not a forensic-grade claim. Read-back verification and hashes are the primary evidence; the classifier is an additional check.
- Compressed and encrypted data looks statistically random. The final zero pass with read-back, plus the signature scan, is what covers this case.
- The pass scheme is inspired by NIST SP 800-88 and DoD 5220.22-M. The tool is not certified as compliant with either.

## Project layout

```
python/
  wipe.py          file/folder overwrite, safety guard, manifest
  volwipe.py       volume wipe with free-space fill (Windows)
  devwipe.py       whole-image / block-device overwrite
  features.py      byte-level features, 4 KB block iteration
  classifier.py    per-block scan and signature scan
  synth.py         synthetic training data
  realdata.py      optional real-file training blocks
  train.py         trains model.joblib
  certificate.py   builds and signs the certificate
  verify_cert.py   independent verifier
  ledger.py        hash-chained ledger
  vhd_search.py    marker search in a raw disk image
keys/              Ed25519 keypair (private.pem is never committed)
```

## Git hygiene

Do not commit:

```
keys/private.pem
manifest*.json
certificate*.json
ledger*.jsonl
outputs/
sandbox/
*.joblib
tampered.json
.venv/
__pycache__/
```

## Warning

This tool destroys data irreversibly. Always confirm the target with `--dry-run` or `Get-Volume` first, and test on a disk image or virtual disk before touching real media.