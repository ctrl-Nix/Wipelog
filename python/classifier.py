import json, sys
from pathlib import Path
import joblib

MODEL = Path(__file__).resolve().parent / "model.joblib"


def residual_risk(features: dict) -> float:
    bundle = joblib.load(MODEL)
    row = [[features[k] for k in bundle["features"]]]
    return float(bundle["model"].predict_proba(row)[0][1])


if __name__ == "__main__":
    m = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else "manifest.json").read_text())
    for f in m["files"]:
        print(f"{f['name']:15s} residual risk = {residual_risk(f['features']):.3f}")