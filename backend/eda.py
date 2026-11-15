import pandas as pd

df = pd.read_csv("data/SMSSpamCollection", sep="\t", names=["label", "text"])
df["chars"] = df.text.str.len()
df["words"] = df.text.str.split().str.len()
df["digits"] = df.text.str.count(r"\d")
df["caps_ratio"] = df.text.apply(lambda t: sum(c.isupper() for c in t) / max(1, len(t)))
df["has_url"] = df.text.str.contains(r"www\.|http|\.com", case=False)
df["has_number"] = df.text.str.contains(r"\d{5,}")

print("Total:", len(df))
print(df.label.value_counts())
print("\nAverages per class:")
print(df.groupby("label")[["chars", "words", "digits", "caps_ratio"]].mean().round(2))
print("\n% messages with URL / 5+ digit number:")
print((df.groupby("label")[["has_url", "has_number"]].mean() * 100).round(1))
print("\nDuplicate messages:", df.text.duplicated().sum())
print("Longest message (chars):", df.chars.max())