# SpamShield: NLP Spam vs Ham Classifier

An end-to-end NLP application that classifies SMS messages as **spam** or **ham**, with a FastAPI backend and a custom web frontend that explains every decision.

**Live demo:** https://spamshield-k6xd.onrender.com/ (free hosting: first load may take 30-50 seconds)

## Features

- **Live analysis** with spam probability and confidence meter
- **Explainability:** words that pushed the verdict are highlighted (red = spam, green = ham), with per-word contribution bars
- **NLP pipeline view:** tokenization, stopword removal, stemming
- **Threshold slider:** adjust spam strictness and see the precision/recall trade-off live
- **Evaluation dashboard:** 4 models, 5-fold cross-validation, ROC curves with AUC, interactive confusion matrix
- **"What the model learned":** strongest spam and ham words across the whole model
- REST API with auto-generated docs at `/docs`

## Architecture

```
Browser (HTML/CSS/JS)
      |  fetch() JSON
      v
FastAPI backend
  POST /predict    text + threshold -> label, probability, explanation, pipeline steps
  GET  /metrics    evaluation results (4 models, CV, ROC)
  GET  /top-words  strongest spam/ham terms
  GET  /health     health check
      |
      v
preprocess.py -> TF-IDF vectorizer -> Logistic Regression
```

## NLP Pipeline

1. **Tokenization:** lowercase, keep alphabetic words
2. **Stopword removal:** drop common words ("the", "is", "you")
3. **Stemming:** Porter Stemmer ("claiming" becomes "claim")
4. **TF-IDF** with unigrams and bigrams
5. **Classification:** Logistic Regression (probability output)

## Results

Held-out 20% test set (1,115 messages, stratified split):

| Model | Accuracy | Precision | Recall | F1 | AUC | 5-fold CV F1 |
|---|---|---|---|---|---|---|
| Naive Bayes | 97.04% | 100.00% | 77.85% | 87.55% | 0.9839 | 88.8 ± 2.6 |
| Logistic Regression (deployed) | 97.49% | 90.07% | 91.28% | 90.67% | 0.9835 | 92.2 ± 0.9 |
| Linear SVM | 98.12% | 94.44% | 91.28% | 92.83% | 0.9851 | 93.5 ± 1.1 |
| Random Forest | 98.12% | 98.48% | 87.25% | 92.53% | 0.9801 | 93.9 ± 1.7 |

**Why Logistic Regression is deployed:** Linear SVM scores slightly higher, but Logistic Regression exposes per-word coefficients, which powers the explainability feature. Accuracy alone is misleading here (about 87% of messages are ham), so precision, recall, F1 and AUC are reported.

## Tech Stack

Python, FastAPI, Uvicorn, scikit-learn, NLTK, pandas, joblib, HTML/CSS/vanilla JavaScript.

## Project Structure

```
spamshield/
├── backend/
│   ├── app.py            # API + serves frontend
│   ├── preprocess.py     # NLP preprocessing
│   ├── train.py          # training, CV, ROC, model export
│   ├── requirements.txt
│   ├── data/             # SMS Spam Collection
│   └── model/            # trained model, vectorizer, metrics
└── frontend/
    ├── index.html        # analyzer
    ├── metrics.html      # evaluation
    ├── style.css
    └── script.js
```

## Run Locally

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python train.py
uvicorn app:app --reload
```

Open http://127.0.0.1:8000

## Limitations

- Trained on English SMS (UK/Singapore, 2000s); Roman Urdu and modern scam styles are not covered
- Very short messages give low-confidence predictions
- Spam without typical keywords can be missed
- Dataset artifacts appear in top words (e.g. "lt gt" from HTML entities)
- Cross-validation fits TF-IDF on the full training set, so CV scores are slightly optimistic; test-set metrics are unaffected

## Future Work

- Collect a Roman Urdu / Pakistani scam dataset
- Character n-grams for spelling variations
- User feedback loop to grow the dataset
- API keys and batch (CSV) checking

## Dataset

SMS Spam Collection (about 5,500 labelled messages).