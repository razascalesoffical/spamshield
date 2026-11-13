# SpamShield: NLP Spam vs Ham Classifier

An end-to-end NLP application that classifies SMS messages as **spam** or **ham** (not spam), with a FastAPI backend and a custom web frontend that shows every step of the NLP pipeline.

## Features

- Live message analysis with spam probability and confidence meter
- Visual NLP pipeline: tokenization, stopword removal, stemming
- Evaluation page: accuracy, precision, recall, F1, confusion matrix
- Two models compared (Naive Bayes vs Logistic Regression), best one chosen by F1
- REST API with auto-generated docs at `/docs`

## NLP Pipeline

1. **Tokenization**: lowercase and split into alphabetic words
2. **Stopword removal**: drop common words ("the", "is", "you")
3. **Stemming**: reduce words to roots using Porter Stemmer ("claiming" becomes "claim")
4. **TF-IDF** (unigrams + bigrams): convert text to weighted numeric vectors
5. **Classification**: Logistic Regression predicts spam probability

## Results

Evaluated on a held-out 20% test set (stratified split):

| Model | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Naive Bayes | 97.04% | 100.00% | 77.85% | 87.55% |
| Logistic Regression | 97.49% | 90.07% | 91.28% | 90.67% |

Accuracy alone is misleading here (about 87% of messages are ham), so precision, recall and F1 are reported too.

## Tech Stack

- **Backend:** Python, FastAPI, Uvicorn
- **ML/NLP:** scikit-learn, NLTK, pandas, joblib
- **Frontend:** HTML, CSS, vanilla JavaScript

## Project Structure
