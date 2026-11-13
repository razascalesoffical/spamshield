import os, json, joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from preprocess import steps

app = FastAPI(title="SpamShield API")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

model = joblib.load("model/model.pkl")
vec = joblib.load("model/vectorizer.pkl")
with open("model/metrics.json") as f:
    metrics = json.load(f)

# Har word/phrase ka "wazan": positive = spam ki taraf, negative = ham ki taraf
terms = np.array(vec.get_feature_names_out())
if hasattr(model, "coef_"):                      # Logistic Regression
    W = model.coef_[0]
else:                                            # Naive Bayes
    W = model.feature_log_prob_[1] - model.feature_log_prob_[0]

# Poore model ke sab se strong spam/ham words (startup pe ek baar)
order = np.argsort(W)
TOP_SPAM = [{"term": str(terms[i]), "weight": round(float(W[i]), 3)} for i in order[-15:][::-1]]
TOP_HAM = [{"term": str(terms[i]), "weight": round(float(W[i]), 3)} for i in order[:15]]

class Msg(BaseModel):
    text: str
    threshold: float = Field(0.5, ge=0.05, le=0.95)   # slider ke liye

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict")
def predict(msg: Msg):
    if not msg.text.strip():
        raise HTTPException(status_code=400, detail="Text empty hai")
    s = steps(msg.text)
    X = vec.transform([" ".join(s["stemmed"])])
    p_spam = float(model.predict_proba(X)[0][1])
    label = "spam" if p_spam >= msg.threshold else "ham"

    # Explainability: is message ke kaun se terms ne kitna zor lagaya
    row = X.tocoo()
    contrib = [{"term": str(terms[j]), "score": round(float(W[j] * v), 4)}
               for j, v in zip(row.col, row.data)]
    contrib.sort(key=lambda c: abs(c["score"]), reverse=True)

    return {"label": label,
            "threshold": msg.threshold,
            "confidence": round((p_spam if label == "spam" else 1 - p_spam) * 100, 2),
            "spam_probability": round(p_spam * 100, 2),
            "steps": s,
            "explanation": contrib[:10]}

@app.get("/metrics")
def get_metrics():
    return metrics

@app.get("/top-words")
def top_words():
    return {"spam": TOP_SPAM, "ham": TOP_HAM}

# Frontend isi server se serve hoga. Ye hamesha SAB routes ke baad aaye.
FRONTEND = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND):
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")