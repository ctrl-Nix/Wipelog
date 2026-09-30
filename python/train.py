from pathlib import Path
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from synth import make_dataset, FEATURES

MODEL = Path(__file__).resolve().parent / "model.joblib"

X, y = make_dataset()
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=0)
clf = RandomForestClassifier(n_estimators=200, max_depth=8, random_state=0).fit(Xtr, ytr)
pred = clf.predict(Xte)
print(classification_report(yte, pred, target_names=["clean", "residual"]))
print("confusion matrix:\n", confusion_matrix(yte, pred))
for name, imp in sorted(zip(FEATURES, clf.feature_importances_), key=lambda t: -t[1]):
    print(f"  {name:22s}{imp:.3f}")
joblib.dump({"model": clf, "features": FEATURES}, MODEL)
print("saved", MODEL)
