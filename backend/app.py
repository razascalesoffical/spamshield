import os, re, json, time, joblib
from collections import defaultdict, deque
from typing import List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from preprocess import steps, clean

app = FastAPI(title="SpamShield API")

app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

model = joblib.load("model/model.pkl")
vec = joblib.load("model/vectorizer.pkl")
with open("model/metrics.json") as f:
    metrics = json.load(f)

# ---------- Baaqi models (compare feature). Na milen to feature band, app chalti rahe ----------
EXTRA = {}
for name, slug in [("Naive Bayes", "naive_bayes"), ("Logistic Regression", "logistic_regression"),
                   ("Linear SVM", "linear_svm"), ("Random Forest", "random_forest")]:
    p = os.path.join("model", "extra", slug + ".pkl")
    if os.path.exists(p):
        try:
            EXTRA[name] = joblib.load(p)
        except Exception:
            pass

# ---------- Explainability weights ----------
terms = np.array(vec.get_feature_names_out())
if hasattr(model, "coef_"):
    W = model.coef_[0]
else:
    W = model.feature_log_prob_[1] - model.feature_log_prob_[0]

order = np.argsort(W)
TOP_SPAM = [{"term": str(terms[i]), "weight": round(float(W[i]), 3)} for i in order[-15:][::-1]]
TOP_HAM = [{"term": str(terms[i]), "weight": round(float(W[i]), 3)} for i in order[:15]]

# ---------- Signals: message ke wo hisse jo preprocessing hata deti hai ----------
CAPS_SKIP = {"OK", "TV", "PC", "UK", "US", "SMS", "ID", "DVD", "CD", "AM", "PM", "OMG", "LOL"}

def signals(text: str):
    nums = re.findall(r"\d[\d\s\-]{3,}\d|\d{5,}", text)
    nums = [re.sub(r"\s+", "", n) for n in nums]
    nums = [n for n in nums if sum(c.isdigit() for c in n) >= 5]
    urls = re.findall(r"(?:https?://\S+|www\.\S+|\b[\w-]+\.(?:com|net|org|co|uk|info|biz|pk)\b\S*)", text, flags=re.I)
    caps = [w for w in re.findall(r"\b[A-Z]{3,}\b", text) if w not in CAPS_SKIP]
    money = re.findall(r"[£$€]\s?\d[\d,\.]*|\b\d[\d,\.]*\s?(?:rs|pkr|usd|gbp|dollars?|pounds?)\b", text, flags=re.I)
    excl = text.count("!")
    return {
        "numbers": {"count": len(nums), "examples": nums[:3]},
        "urls": {"count": len(urls), "examples": urls[:3]},
        "caps": {"count": len(caps), "examples": caps[:5]},
        "money": {"count": len(money), "examples": money[:3]},
        "exclamations": excl,
    }

# ---------- API key + rate limiting (demo level) ----------
DEMO_KEYS = {"demo-key-123"}
_hits = defaultdict(deque)

def limiter(name: str, anon_per_min: int, keyed_per_min: int):
    def dep(request: Request, x_api_key: Optional[str] = Header(default=None)):
        if x_api_key is not None and x_api_key not in DEMO_KEYS:
            raise HTTPException(status_code=401, detail="Invalid API key")
        fwd = request.headers.get("x-forwarded-for")
        ip = (fwd.split(",")[0].strip() if fwd
              else (request.client.host if request.client else "unknown"))
        limit = keyed_per_min if x_api_key else anon_per_min
        ident = f"{name}:{x_api_key or ip}"
        now = time.time()
        q = _hits[ident]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status_code=429,
                                detail=f"Rate limit exceeded ({limit} requests/min). Try again in a minute.")
        q.append(now)
    return dep

# ---------- Request models ----------
class Msg(BaseModel):
    text: str
    threshold: float = Field(0.5, ge=0.05, le=0.95)

class Batch(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=200)
    threshold: float = Field(0.5, ge=0.05, le=0.95)

class Feedback(BaseModel):
    text: str = Field(..., max_length=2000)
    predicted: str
    correct: str
    note: Optional[str] = Field(default=None, max_length=300)

# ---------- Routes ----------
@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict", dependencies=[Depends(limiter("predict", 60, 300))])
def predict(msg: Msg):
    if not msg.text.strip():
        raise HTTPException(status_code=400, detail="Text empty hai")
    s = steps(msg.text)
    X = vec.transform([" ".join(s["stemmed"])])
    p_spam = float(model.predict_proba(X)[0][1])
    label = "spam" if p_spam >= msg.threshold else "ham"

    row = X.tocoo()
    contrib = [{"term": str(terms[j]), "score": round(float(W[j] * v), 4)}
               for j, v in zip(row.col, row.data)]
    contrib.sort(key=lambda c: abs(c["score"]), reverse=True)

    # Out-of-vocabulary: kitne words model ki vocabulary mein hain
    vocab = vec.vocabulary_
    uniq = list(dict.fromkeys(s["stemmed"]))
    known = [w for w in uniq if w in vocab]
    unknown = [w for w in uniq if w not in vocab]
    ratio = (len(known) / len(uniq)) if uniq else 0.0

    # Compare: har model ka verdict isi message par (selected threshold ke sath)
    compare = []
    for name, m in EXTRA.items():
        try:
            p = float(m.predict_proba(X)[0][1])
        except Exception:
            continue
        compare.append({"model": name,
                        "label": "spam" if p >= msg.threshold else "ham",
                        "spam_probability": round(p * 100, 2),
                        "deployed": name == metrics.get("best_model")})

    return {"label": label,
            "threshold": msg.threshold,
            "confidence": round((p_spam if label == "spam" else 1 - p_spam) * 100, 2),
            "spam_probability": round(p_spam * 100, 2),
            "steps": s,
            "explanation": contrib[:10],
            "signals": signals(msg.text),
            "vocab": {"known": len(known), "total": len(uniq),
                      "known_ratio": round(ratio * 100, 1), "unknown": unknown[:10]},
            "compare": compare}

@app.post("/predict-batch", dependencies=[Depends(limiter("batch", 10, 60))])
def predict_batch(b: Batch):
    texts = [t.strip()[:2000] for t in b.texts]
    cleaned = [clean(t) for t in texts]
    probs = model.predict_proba(vec.transform(cleaned))[:, 1]
    results = []
    for t, p in zip(texts, probs):
        label = "spam" if p >= b.threshold else "ham"
        results.append({"text": t,
                        "label": label,
                        "spam_probability": round(float(p) * 100, 2),
                        "confidence": round((float(p) if label == "spam" else 1 - float(p)) * 100, 2)})
    n_spam = sum(1 for r in results if r["label"] == "spam")
    return {"count": len(results), "spam": n_spam, "ham": len(results) - n_spam,
            "threshold": b.threshold, "results": results}

FEEDBACK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feedback")
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, "feedback.jsonl")

@app.post("/feedback", dependencies=[Depends(limiter("feedback", 20, 100))])
def feedback(fb: Feedback):
    if fb.predicted not in ("spam", "ham") or fb.correct not in ("spam", "ham"):
        raise HTTPException(status_code=400, detail="Label spam ya ham hona chahiye")
    os.makedirs(FEEDBACK_DIR, exist_ok=True)
    with open(FEEDBACK_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": int(time.time()), **fb.model_dump()}, ensure_ascii=False) + "\n")
    with open(FEEDBACK_FILE, encoding="utf-8") as f:
        total = sum(1 for _ in f)
    return {"saved": True, "total_feedback": total}

@app.get("/metrics")
def get_metrics():
    return metrics

@app.get("/top-words")
def top_words():
    return {"spam": TOP_SPAM, "ham": TOP_HAM}

FRONTEND = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND):
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")