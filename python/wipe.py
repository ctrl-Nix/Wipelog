"""
File/folder secure-overwrite tool.
Passes: 0x00, 0xFF, random (multi-pass, inspired by DoD 5220.22-M).
Writes a manifest (JSON) with hashes and byte-level features.

Overwriting a file on an SSD is not guaranteed to reach every physical cell.
"""
import argparse, hashlib, json, os, secrets, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from features import analyze  

ROOT = Path(__file__).resolve().parent.parent
CHUNK = 64 * 1024
PASSES = ["zero", "ones", "random"]

# System folders: never wipe
PROTECTED = [Path(p).resolve() for p in filter(None, [
    os.environ.get("SystemRoot"), os.environ.get("ProgramFiles"),
    os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramData"),
    "/bin", "/boot", "/etc", "/usr", "/sbin", "/lib", "/var", "/System",
])]

# Our own source folders: never wipe
PROJECT_CODE = [ROOT / n for n in (
    "python", "app", "lib", "components", "scripts",
    ".git", "node_modules", ".venv", ".next", "package.json",
)]


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while chunk := f.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


def check_target(t: Path) -> Path:
    if t.is_symlink():
        raise SystemExit(f"Refusing symlink: {t}")
    rt = t.resolve()
    if not rt.exists():
        raise SystemExit(f"Not found: {rt}")
    if len(rt.parts) <= 2:
        raise SystemExit(f"Refusing drive root or top-level folder: {rt}")
    for bad in PROTECTED:
        if rt == bad or bad in rt.parents or rt in bad.parents:
            raise SystemExit(f"Refusing protected path: {rt}")
    for code in PROJECT_CODE:
        code = code.resolve()
        if rt == code or code in rt.parents or rt in code.parents:
            raise SystemExit(f"Refusing project code path: {rt}")
    if rt == ROOT or rt in ROOT.parents:
        raise SystemExit(f"Refusing project root or its parents: {rt}")
    return rt


def collect(rt: Path):
    if rt.is_file():
        return [rt]
    files = []
    for dp, _, names in os.walk(rt, followlinks=False):
        for n in names:
            p = Path(dp) / n
            if not p.is_symlink():
                files.append(p)
    return sorted(files)


def overwrite(path: Path):
    size = path.stat().st_size
    with open(path, "r+b", buffering=0) as f:
        for kind in PASSES:
            f.seek(0)
            left = size
            while left > 0:
                n = min(CHUNK, left)
                if kind == "zero":
                    buf = b"\x00" * n
                elif kind == "ones":
                    buf = b"\xff" * n
                else:
                    buf = os.urandom(n)
                f.write(buf)
                left -= n
            f.flush()
            os.fsync(f.fileno())


def create_samples():
    d = ROOT / "sandbox"
    d.mkdir(exist_ok=True)
    (d / "notes.txt").write_bytes(("Meeting notes: budget 40000. Contact demo@example.com\n" * 400).encode())
    (d / "records.csv").write_bytes(("id,name,email\n" + "".join(f"{i},User{i},user{i}@example.com\n" for i in range(800))).encode())
    (d / "config.json").write_bytes(json.dumps({"token": "DEMO-NOT-A-SECRET", "items": list(range(500))}).encode())
    print(f"Created sample files in {d}")


def main():
    ap = argparse.ArgumentParser(description="Multi-pass file overwrite tool")
    ap.add_argument("--create-samples", action="store_true", help="make test files in ./sandbox")
    ap.add_argument("--target", help="file or folder to wipe")
    ap.add_argument("--dry-run", action="store_true", help="list what would be wiped, change nothing")
    ap.add_argument("--delete", action="store_true", help="delete files after overwriting")
    ap.add_argument("--yes", action="store_true", help="skip typed confirmation")
    ap.add_argument("--out", default="manifest.json", help="manifest output path")
    a = ap.parse_args()

    if a.create_samples:
        create_samples()
    if not a.target:
        if not a.create_samples:
            ap.print_help()
        return

    rt = check_target(Path(a.target))
    files = collect(rt)
    total = sum(f.stat().st_size for f in files)
    print(f"Target: {rt}\nFiles: {len(files)}  Bytes: {total}\nPasses: {', '.join(PASSES)}  Delete after: {a.delete}")

    if a.dry_run:
        for f in files[:20]:
            print("  would wipe:", f)
        if len(files) > 20:
            print(f"  ... and {len(files) - 20} more")
        return
    if not files:
        raise SystemExit("Nothing to wipe.")
    if not a.yes and input("This is irreversible. Type WIPE to continue: ").strip() != "WIPE":
        raise SystemExit("Cancelled.")

    started = time.time()
    entries = []
    for f in files:
        size = f.stat().st_size
        before = sha256_file(f)
        overwrite(f)
        after = sha256_file(f)
        if size > 0 and before == after:
            raise SystemExit(f"Overwrite did not change content: {f}")
        feats = analyze(f)  # must run before delete
        entries.append({
            "name": f.name, "size": size,
            "sha256_before": before, "sha256_after": after,
            "features": feats,
        })
        if a.delete:
            tmp = f.with_name(secrets.token_hex(8))
            f.rename(tmp)
            tmp.unlink()
        print("wiped:", f.name)

    manifest = {
        "method": "FILE_OVERWRITE",
        "passes": PASSES,
        "deleted_after": a.delete,
        "target_name": rt.name,
        "files": entries,
        "file_count": len(entries),
        "bytes": total,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(started)),
        "completed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    Path(a.out).write_text(json.dumps(manifest, indent=2))
    print(f"Done. Manifest: {a.out}")


if __name__ == "__main__":
    main()