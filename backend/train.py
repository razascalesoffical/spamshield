import json, os, joblib
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

# 2. Split (stratified: dono hisson mein spam ka ratio same)
X_tr, X_te, y_tr, y_te = train_test_split(
    df["clean"], df["y"], test_size=0.2, stratify=df["y"], random_state=42)

# 3. TF-IDF (fit sirf train pe)
vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2)
Xtr = vec.fit_transform(X_tr)
Xte = vec.transform(X_te)

# 4. Chaar models
# LinearSVC ke paas probability nahi hoti, isliye CalibratedClassifierCV se wrap karte hain
models = {
    "Naive Bayes": MultinomialNB(),
    "Logistic Regression": LogisticRegression(max_iter=1000, class_weight="balanced"),
    "Linear SVM": CalibratedClassifierCV(LinearSVC(class_weight="balanced"), cv=3),
    "Random Forest": RandomForestClassifier(n_estimators=200, class_weight="balanced",
                                            random_state=42, n_jobs=-1),
}

# 5-fold CV: poore train set pe 5 baar alag-alag hisse se test karke dekhna
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

results, rocs = {}, {}
best_name, best_f1, best_model = None, -1, None

for name, m in models.items():
    # Cross-validation (F1). Har fold mein vectorizer dobara fit nahi hota (chhota leak,
    # lekin comparison ke liye theek); final test numbers neeche alag hain.
    cv = cross_val_score(m, Xtr, y_tr, cv=skf, scoring="f1", n_jobs=1)

    m.fit(Xtr, y_tr)
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
    # ROC points kam karo (har ~5th point) taake JSON chhota rahe
    idx = np.linspace(0, len(fpr) - 1, min(60, len(fpr))).astype(int)
    rocs[name] = {"fpr": [round(float(fpr[i]), 4) for i in idx],
                  "tpr": [round(float(tpr[i]), 4) for i in idx]}
    print(name, results[name])

    # Explainability ke liye sirf wo models jin ke paas coef_ / feature_log_prob_ hai
    if name in ("Naive Bayes", "Logistic Regression") and f1 > best_f1:
        best_name, best_f1, best_model = name, f1, m

# Overall winner sirf report ke liye (F1 ke hisaab se)
overall = max(results, key=lambda k: results[k]["f1"])

os.makedirs("model", exist_ok=True)
joblib.dump(best_model, "model/model.pkl")
joblib.dump(vec, "model/vectorizer.pkl")
with open("model/metrics.json", "w") as f:
    json.dump({"best_model": best_name, "overall_best": overall,
               "train_size": len(X_tr), "test_size": len(X_te),
               "models": results, "roc": rocs}, f, indent=2)
print("Deployed model (explainable):", best_name, "| Best F1 overall:", overall)