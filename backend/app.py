import json, joblib
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from preprocess import steps

app = FastAPI(title="Spam Classifier API")

# CORS: frontend alag domain pe hoga, iske bina browser request block kar deta hai
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# Model ek baar startup pe load hota hai, har request pe nahi (tez rehne ke liye)
model = joblib.load("model/model.pkl")
vec = joblib.load("model/vectorizer.pkl")
with open("model/metrics.json") as f:
    metrics = json.load(f)

class Msg(BaseModel):
    text: str   # request body mein sirf "text" field aayegi

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/predict")
def predict(msg: Msg):
    if not msg.text.strip():
        raise HTTPException(status_code=400, detail="Text empty hai")
    s = steps(msg.text)                              # wahi preprocessing jo training mein thi
    X = vec.transform([" ".join(s["stemmed"])])      # text -> TF-IDF numbers
    p = model.predict_proba(X)[0]                    # [ham_probability, spam_probability]
    label = "spam" if p[1] >= 0.5 else "ham"
    return {"label": label,
            "confidence": round(float(max(p)) * 100, 2),
            "spam_probability": round(float(p[1]) * 100, 2),
            "steps": s}

@app.get("/metrics")
def get_metrics():
    return metrics
# Frontend files isi server se serve hongi (ek hi link pe sab kuch)
# Ye hamesha SAB routes ke baad aana chahiye, warna /predict ko overwrite kar dega
import os
from fastapi.staticfiles import StaticFiles

FRONTEND = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND):
    app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")