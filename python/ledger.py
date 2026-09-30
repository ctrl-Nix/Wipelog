"""Append-only, hash-chained ledger of issued certificates."""
import hashlib, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "ledger.jsonl"
GENESIS = "0" * 64


def _canon(o) -> bytes:
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _read(path=LEDGER):
    p = Path(path)
    if not p.exists():
        return []
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def append(cert: dict, path=LEDGER) -> dict:
    entries = _read(path)
    entry = {
        "index": len(entries),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "cert_id": cert["payload"]["cert_id"],
        "cert_sha256": _sha(_canon(cert["payload"])),
        "signature": cert["signature"],
        "prev_hash": entries[-1]["entry_hash"] if entries else GENESIS,
    }
    entry["entry_hash"] = _sha(_canon(entry))
    with open(path, "a") as f:
        f.write(json.dumps(entry, sort_keys=True) + "\n")
    return entry


def verify(path=LEDGER):
    prev = GENESIS
    for i, e in enumerate(_read(path)):
        body = {k: v for k, v in e.items() if k != "entry_hash"}
        if e.get("index") != i:
            return False, f"index mismatch at entry {i}"
        if e.get("prev_hash") != prev:
            return False, f"chain broken at entry {i} (prev_hash mismatch)"
        if _sha(_canon(body)) != e.get("entry_hash"):
            return False, f"entry {i} was modified (hash mismatch)"
        prev = e["entry_hash"]
    return True, "chain intact"


def contains(payload: dict, path=LEDGER) -> bool:
    h = _sha(_canon(payload))
    return any(e["cert_sha256"] == h for e in _read(path))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "verify"
    path = sys.argv[2] if len(sys.argv) > 2 else LEDGER
    if cmd == "show":
        for e in _read(path):
            print(f"#{e['index']}  {e['timestamp']}  {e['cert_id']}  {e['entry_hash'][:16]}...")
    else:
        ok, msg = verify(path)
        print(("LEDGER VALID: " if ok else "LEDGER INVALID: ") + msg)
        sys.exit(0 if ok else 1)