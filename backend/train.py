import json, os, re, joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.svm import LinearSVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (accuracy_score, precision_score, recall_score,
                             f1_score, confusion_matrix, roc_curve, roc_auc_score)
from preprocess import clean

# 1. Data
df = pd.read_csv("data/SMSSpamCollection", sep="\t", names=["label", "text"])
df["y"] = (df["label"] == "spam").astype(int)
df["clean"] = df["text"].apply(clean)

# 2. Split (stratified, wahi seed)
X_tr, X_te, y_tr, y_te = train_test_split(
    df["clean"], df["y"], test_size=0.2, stratify=df["y"], random_state=42)

# 3. TF-IDF (fit sirf train pe)
vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2)
Xtr = vec.fit_transform(X_tr)
Xte = vec.transform(X_te)

# 4. Chaar models (pehle jaise)
models = {
    "Naive Bayes": MultinomialNB(),
    "Logistic Regression": LogisticRegression(max_iter=1000, class_weight="balanced"),
    "Linear SVM": CalibratedClassifierCV(LinearSVC(class_weight="balanced"), cv=3),
    "Random Forest": RandomForestClassifier(n_estimators=200, class_weight="balanced",
                                            random_state=42, n_jobs=-1),
}

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

results, rocs = {}, {}
best_name, best_f1, best_model = None, -1, None
trained = {}

for name, m in models.items():
    cv = cross_val_score(m, Xtr, y_tr, cv=skf, scoring="f1", n_jobs=1)

    m.fit(Xtr, y_tr)
    trained[name] = m
    pred = m.predict(Xte)
    proba = m.predict_proba(Xte)[:, 1]
    f1 = f1_score(y_te, pred)
    fpr, tpr, _ = roc_curve(y_te, proba)

    results[name] = {
        "accuracy": round(accuracy_score(y_te, pred), 4),
        "precision": round(precision_score(y_te, pred), 4),
        "recall": round(recall_score(y_te, pred), 4),
        "f1": round(f1, 4),
        "auc": round(roc_auc_score(y_te, proba), 4),
        "cv_f1_mean": round(float(cv.mean()), 4),
        "cv_f1_std": round(float(cv.std()), 4),
        "confusion_matrix": confusion_matrix(y_te, pred).tolist(),
    }
    idx = np.linspace(0, len(fpr) - 1, min(60, len(fpr))).astype(int)
    rocs[name] = {"fpr": [round(float(fpr[i]), 4) for i in idx],
                  "tpr": [round(float(tpr[i]), 4) for i in idx]}
    print(name, results[name])

    if name in ("Naive Bayes", "Logistic Regression") and f1 > best_f1:
        best_name, best_f1, best_model = name, f1, m

overall = max(results, key=lambda k: results[k]["f1"])

# 5. NAYA: deployed model ke liye threshold vs precision/recall (test set par)
p_best = best_model.predict_proba(Xte)[:, 1]
y_arr = np.asarray(y_te)
curve = []
for t in np.arange(0.10, 0.951, 0.05):
    pr = (p_best >= t).astype(int)
    tp = int(((pr == 1) & (y_arr == 1)).sum())
    fp = int(((pr == 1) & (y_arr == 0)).sum())
    fn = int(((pr == 0) & (y_arr == 1)).sum())
    tn = int(((pr == 0) & (y_arr == 0)).sum())
    prec = tp / (tp + fp) if (tp + fp) else 1.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    curve.append({"threshold": round(float(t), 2),
                  "precision": round(prec, 4), "recall": round(rec, 4),
                  "tp": tp, "fp": fp, "fn": fn, "tn": tn})

# 6. Save
os.makedirs("model", exist_ok=True)
joblib.dump(best_model, "model/model.pkl")
joblib.dump(vec, "model/vectorizer.pkl")

# NAYA: baaqi models "compare" feature ke liye (ye GitHub par nahi jayenge, Render build mein ban jayenge)
os.makedirs("model/extra", exist_ok=True)
for name, m in trained.items():
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    joblib.dump(m, f"model/extra/{slug}.pkl", compress=3)

with open("model/metrics.json", "w") as f:
    json.dump({"best_model": best_name, "overall_best": overall,
               "train_size": len(X_tr), "test_size": len(X_te),
               "models": results, "roc": rocs, "threshold_curve": curve}, f, indent=2)

print("Deployed model (explainable):", best_name, "| Best F1 overall:", overall)
print("Threshold curve points:", len(curve))