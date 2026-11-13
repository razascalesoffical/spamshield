import re
from nltk.stem import PorterStemmer
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

stemmer = PorterStemmer()

def steps(text):
    # Step A: lowercase karo, aur sirf alphabet wale words nikalo (tokenization)
    tokens = re.findall(r"[a-z]+", text.lower())
    # Step B: "the, is, a" jaise bekaar words hatao (stopword removal)
    no_stop = [t for t in tokens if t not in ENGLISH_STOP_WORDS]
    # Step C: word ko root form mein lao: "winning" -> "win" (stemming)
    stemmed = [stemmer.stem(t) for t in no_stop]
    return {"tokens": tokens, "no_stopwords": no_stop, "stemmed": stemmed}

def clean(text):
    # Training ke liye: stemmed words ko wapas ek string bana do
    return " ".join(steps(text)["stemmed"])