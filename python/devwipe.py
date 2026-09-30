"""Whole-device wipe (Phase 1): inventory, guard, overwrite, full verification.
Works on block devices (/dev/sdX) and on disk-image files for safe testing."""
import argparse, json, os, subprocess, sys
from pathlib import Path

CHUNK = 4 * 1024 * 1024


def lsblk():
    out = subprocess.run(["lsblk", "-J", "-b", "-o", "NAME,PATH,SIZE,MODEL,SERIAL,TYPE,MOUNTPOINTS,ROTA,TRAN"],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)["blockdevices"]


def mounted_disks():
    """Disks holding any mounted filesystem (including /) are never wipeable."""
    bad = set()
    for d in lsblk():
        nodes = [d] + d.get("children", [])
        if any(m for n in nodes for m in (n.get("mountpoints") or []) if m):
            bad.add(d["path"])
    return bad


def size_of(target: Path) -> int:
    if target.is_file():
        return target.stat().st_size
    with open(target, "rb") as f:
        return f.seek(0, os.SEEK_END)


def guard(target: Path, allow_device: bool):
    if not target.exists():
        raise SystemExit(f"Not found: {target}")
    if target.is_file():
        return  # image file, safe
    if not allow_device:
        raise SystemExit("Block device given. Pass --i-know-this-destroys-the-device to allow.")
    if str(target.resolve()) in mounted_disks():
        raise SystemExit(f"Refusing: {target} has mounted partitions (system or in use).")


def overwrite_full(target: Path, passes=("random", "ones", "zero")):
    size = size_of(target)
    with open(target, "r+b", buffering=0) as f:
        for kind in passes:
            f.seek(0)
            left = size
            while left > 0:
                n = min(CHUNK, left)
                f.write(os.urandom(n) if kind == "random" else (b"\xff" if kind == "ones" else b"\x00") * n)
                left -= n
                print(f"\r  pass {kind:6s} {100 * (size - left) // size:3d}%", end="", flush=True)
            f.flush(); os.fsync(f.fileno())
            print()


def verify_zero_full(target: Path):
    """Read back the WHOLE device; every byte must be zero."""
    size, bad = size_of(target), 0
    with open(target, "rb") as f:
        pos = 0
        while chunk := f.read(CHUNK):
            if chunk.count(0) != len(chunk):
                bad += len(chunk) - chunk.count(0)
            pos += len(chunk)
    return bad == 0, bad, pos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("--i-know-this-destroys-the-device", action="store_true", dest="allow")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--out", default="device_manifest.json")
    a = ap.parse_args()

    t = Path(a.target)
    guard(t, a.allow)
    size = size_of(t)
    print(f"Target: {t}  size: {size} bytes")
    if not a.yes and input(f"Type the size in bytes ({size}) to confirm: ").strip() != str(size):
        raise SystemExit("Cancelled.")

    overwrite_full(t)
    ok, bad, checked = verify_zero_full(t)
    print("read-back:", "ALL ZERO" if ok else f"{bad} non-zero bytes")
    Path(a.out).write_text(json.dumps({
        "method": "DEVICE_OVERWRITE", "passes": ["random", "ones", "zero"],
        "target": str(t), "size": size, "bytes_verified": checked,
        "readback_zero": ok, "nonzero_bytes": bad}, indent=2))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()