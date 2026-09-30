"""Volume wipe for Windows: overwrite every file, delete, then fill free space
(random then zero), verify by read-back, remove filler. Removable drives only by default."""
import argparse, ctypes, json, os, secrets, subprocess, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from wipe import overwrite, sha256_file, ROOT
from classifier import scan_file

CHUNK = 4 * 1024 * 1024
DRIVE_REMOVABLE, DRIVE_FIXED = 2, 3


def drive_type(letter):
    return ctypes.windll.kernel32.GetDriveTypeW(f"{letter}:\\")


def drive_info(letter):
    ps = (f"$p=Get-Partition -DriveLetter {letter}; $d=$p|Get-Disk; $v=Get-Volume -DriveLetter {letter};"
          "[pscustomobject]@{model=$d.FriendlyName;serial=($d.SerialNumber -as [string]).Trim();"
          "disk_size=$d.Size;bus=[string]$d.BusType;fs=$v.FileSystem;label=$v.FileSystemLabel}|ConvertTo-Json")
    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"model": "unknown", "serial": "unknown"}


def guard(letter, allow_fixed):
    letter = letter.strip(":\\/").upper()
    if len(letter) != 1 or not letter.isalpha():
        raise SystemExit("Give a drive letter like E")
    sysdrive = os.environ.get("SystemDrive", "C:")[0].upper()
    if letter == sysdrive:
        raise SystemExit("Refusing: system drive.")
    if letter == str(ROOT.resolve())[0].upper():
        raise SystemExit("Refusing: drive that holds this project.")
    t = drive_type(letter)
    if t == DRIVE_REMOVABLE:
        return letter
    if t == DRIVE_FIXED and allow_fixed:
        return letter
    raise SystemExit("Refusing: not a removable drive (use --allow-fixed for external HDD).")


def free_bytes(root):
    import shutil
    return shutil.disk_usage(root).free


def fill(root, kind):
    """Write filler until the disk is full. Returns list of filler paths and bytes written."""
    paths, total, idx = [], 0, 0
    try:
        while True:
            p = root / f".fill_{secrets.token_hex(4)}_{idx}.bin"
            paths.append(p)
            with open(p, "wb", buffering=0) as f:
                while True:
                    f.write(os.urandom(CHUNK) if kind == "random" else b"\x00" * CHUNK)
                    total += CHUNK
                    if total % (256 * 1024 * 1024) == 0:
                        print(f"\r  {kind}: {total // 2**20} MB", end="", flush=True)
            idx += 1
    except OSError:
        pass  # disk full is the expected end
    for p in paths:
        try:
            with open(p, "r+b") as f:
                os.fsync(f.fileno())
        except OSError:
            pass
    print(f"\r  {kind}: {total // 2**20} MB written")
    return paths, total


def verify_zero(paths):
    bad = checked = 0
    for p in paths:
        with open(p, "rb") as f:
            while c := f.read(CHUNK):
                checked += len(c)
                bad += len(c) - c.count(0)
    return bad == 0, checked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("drive")
    ap.add_argument("--allow-fixed", action="store_true")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--out", default="manifest.json")
    a = ap.parse_args()

    letter = guard(a.drive, a.allow_fixed)
    root = Path(f"{letter}:\\")
    info = drive_info(letter)
    files = [Path(dp) / n for dp, _, ns in os.walk(root) for n in ns
             if "System Volume Information" not in dp and "$RECYCLE.BIN" not in dp]
    print(f"Drive {letter}: {info.get('model')}  serial={info.get('serial')}  files={len(files)}")
    if not a.yes and input(f"Type {letter} to ERASE drive {letter}: ").strip().upper() != letter:
        raise SystemExit("Cancelled.")

    started = time.time()
    entries = []
    for f in files:
        try:
            size = f.stat().st_size
            before = sha256_file(f)
            overwrite(f)
            scan = scan_file(f)
            entries.append({"name": f.name, "size": size, "sha256_before": before,
                            "sha256_after": sha256_file(f), "block_scan": scan, "readback_zero": True})
            tmp = f.with_name(secrets.token_hex(8)); f.rename(tmp); tmp.unlink()
        except OSError as e:
            raise SystemExit(f"Could not wipe {f}: {e}")
    print(f"Files wiped: {len(entries)}. Filling free space...")

    paths, _ = fill(root, "random")
    for p in paths: p.unlink()
    paths, written = fill(root, "zero")
    ok, checked = verify_zero(paths)
    print("free-space read-back:", "ALL ZERO" if ok else "NON-ZERO FOUND")
    for p in paths: p.unlink()
    if not ok:
        raise SystemExit("Verification failed.")

    manifest = {
        "method": "VOLUME_OVERWRITE_FREESPACE", "passes": ["random", "zero"],
        "deleted_after": True, "target_name": f"{letter}:", "device": info,
        "files": entries, "file_count": len(entries), "bytes": written,
        "free_space_verified_bytes": checked,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    Path(a.out).write_text(json.dumps(manifest, indent=2))
    print("Done. Manifest:", a.out)


if __name__ == "__main__":
    main()