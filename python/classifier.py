import json, re, sys
from functools import lru_cache
from pathlib import Path
import joblib
import numpy as np
from features import analyze_bytes, iter_blocks

MODEL = Path(__file__).resolve().parent / "model.joblib"

# Headers of common formats whose payload looks random (compressed/encrypted).
SIGS = re.compile(
    rb"%PDF-|\x89PNG\r\n\x1a\n|SQLite format 3\x00|Exif\x00\x00|JFIF\x00|GIF8[79]a"
    rb"|Rar!\x1a\x07|7z\xbc\xaf\x27\x1c|\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    rb"|PK\x03\x04[\x0a\x14\x2d]\x00|PK\x05\x06\x00\x00\x00\x00"
)


@lru_cache(maxsize=1)
def _bundle():
    if not MODEL.exists():
        raise SystemExit("model.joblib missing. Run: cd python; ..\\.venv\\Scripts\\python.exe train.py")
    return joblib.load(MODEL)


def scan_file(path, threshold=0.5) -> dict:
    b = _bundle()
    rows, sig = [], []
    for blk in iter_blocks(path):
        f = analyze_bytes(blk)
        rows.append([f[k] for k in b["features"]])
        sig.append(bool(SIGS.search(blk)))
    if not rows:
        return {"blocks": 0, "max_risk": 0.0, "mean_risk": 0.0, "flagged_blocks": 0,
                "signature_blocks": 0, "flagged_fraction": 0.0, "verdict": "EMPTY",
                "block_risks": []}
    probs = b["model"].predict_proba(rows)[:, 1]
    mask = (probs >= threshold) | np.array(sig)
    flagged = int(mask.sum())
    return {
        "blocks": len(rows),
        "max_risk": round(float(probs.max()), 4),
        "mean_risk": round(float(probs.mean()), 4),
        "flagged_blocks": flagged,
        "signature_blocks": int(sum(sig)),
        "flagged_fraction": round(flagged / len(rows), 4),
        "verdict": "PASS" if flagged == 0 else "FAIL",
        "block_risks": [round(float(p), 4) for p in probs],
    }


if __name__ == "__main__":
    arg = Path(sys.argv[1] if len(sys.argv) > 1 else "manifest.json")
    if arg.suffix == ".json":
        for f in json.loads(arg.read_text())["files"]:
            s = f["block_scan"]
            print(f"{f['name']:15s} {s['verdict']}  max={s['max_risk']}  flagged={s['flagged_blocks']}/{s['blocks']}")
    else:
        files = [arg] if arg.is_file() else sorted(p for p in arg.rglob("*") if p.is_file())
        for p in files:
            s = scan_file(p)
            print(f"{p.name:15s} {s['verdict']}  max={s['max_risk']}  flagged={s['flagged_blocks']}/{s['blocks']}  sig={s['signature_blocks']}")