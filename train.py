import os
import pandas as pd
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

print("1. Loading Google's Massive Dataset...")
try:
    df = pd.read_csv("train.csv")
except FileNotFoundError:
    print("ERROR: I can't find train.csv! Did you download it from Kaggle and put it in this folder?")
    exit()

# The Jigsaw dataset breaks toxicity into 6 categories.
# Let's combine them: If a comment triggers ANY of these 6 flags, we label it as '1' (Toxic).
print("2. Cleaning the labels...")
toxic_columns = ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate']
df['is_toxic'] = df[toxic_columns].max(axis=1)

# If we have a local mistakes.csv file from the browser extension, add those examples as innocent text.
mistakes_path = "mistakes.csv"
if os.path.exists(mistakes_path):
    try:
        mistakes_df = pd.read_csv(mistakes_path, usecols=["text"])
        mistakes_df = mistakes_df.rename(columns={"text": "comment_text"})
        mistakes_df["is_toxic"] = 0
        print(f"2a. Adding {len(mistakes_df)} reported innocent comments from mistakes.csv...")
    except Exception as e:
        print(f"WARNING: Could not load mistakes.csv: {e}")
        mistakes_df = None
else:
    mistakes_df = None

# The dataset has 159,000 rows. Let's train on 50,000 of them so your computer doesn't catch on fire.
# It will still be incredibly smart.
df_subset = df.sample(n=50000, random_state=42)
if mistakes_df is not None and len(mistakes_df) > 0:
    df_subset = pd.concat([df_subset, mistakes_df], ignore_index=True)

print("3. Building AI Pipeline...")
# We use max_features=20000 to keep the math fast, and ngram_range=(1,2) so the AI learns 
# pairs of words (like "shut up" instead of just "shut" and "up").
model = Pipeline([
    ("vectorizer", TfidfVectorizer(lowercase=True, stop_words="english", max_features=25000, ngram_range=(1,3))),
    ("classifier", LogisticRegression(class_weight="balanced", max_iter=1000))
])

print("4. Training the AI! (This might take about 1 to 2 minutes)...")
# Note: Google's column for the text is called "comment_text" instead of just "text"
model.fit(df_subset["comment_text"], df_subset["is_toxic"])

print("5. Saving Model...")
with open("my_model.pkl", "wb") as f:
    pickle.dump(model, f)

print("SUCCESS! Your new, terrifyingly smart AI has been saved as my_model.pkl")
