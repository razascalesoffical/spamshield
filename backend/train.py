import json, os, joblib
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from preprocess import clean

# 1. Dataset load: tab-separated, 2 columns (label, text)
df = pd.read_csv("data/SMSSpamCollection", sep="\t", names=["label", "text"])
df["y"] = (df["label"] == "spam").astype(int)   # spam=1, ham=0 (model ko numbers chahiye)
df["clean"] = df["text"].apply(clean)           # har message pe preprocessing

# 2. Train/test split: 80% seekhne ke liye, 20% imtihan ke liye
#    stratify = dono hisson mein spam ka ratio same rahe (dataset imbalanced hai)
X_tr, X_te, y_tr, y_te = train_test_split(
    df["clean"], df["y"], test_size=0.2, stratify=df["y"], random_state=42)

# 3. TF-IDF: text ko numbers mein badalta hai
#    ngram_range=(1,2) = single words + 2-word phrases ("free prize")
#    min_df=2 = jo word sirf 1 message mein aaye, usay ignore karo
vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2)
Xtr = vec.fit_transform(X_tr)   # fit SIRF train pe, warna test ka data leak ho jata hai
Xte = vec.transform(X_te)

# 4. Do models
models = {
    "Naive Bayes": MultinomialNB(),
    "Logistic Regression": LogisticRegression(max_iter=1000, class_weight="balanced"),
}

# 5. Dono train karo, evaluate karo, behtareen (F1 ke hisaab se) chuno
results, best_name, best_f1, best_model = {}, None, -1, None
for name, m in models.items():
    m.fit(Xtr, y_tr)
    pred = m.predict(Xte)
    f1 = f1_score(y_te, pred)
    results[name] = {
        "accuracy": round(accuracy_score(y_te, pred), 4),
        "precision": round(precision_score(y_te, pred), 4),
        "recall": round(recall_score(y_te, pred), 4),
        "f1": round(f1, 4),
        "confusion_matrix": confusion_matrix(y_te, pred).tolist(),
    }
    print(name, results[name])
    if f1 > best_f1:
        best_name, best_f1, best_model = name, f1, m

# 6. Save: model, vectorizer, aur metrics (backend inhi ko load karega)
os.makedirs("model", exist_ok=True)
joblib.dump(best_model, "model/model.pkl")
joblib.dump(vec, "model/vectorizer.pkl")
with open("model/metrics.json", "w") as f:
    json.dump({"best_model": best_name, "train_size": len(X_tr),
               "test_size": len(X_te), "models": results}, f, indent=2)
print("Best:", best_name)