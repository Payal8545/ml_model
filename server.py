from typing import List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pickle
import sqlite3
import csv
import os
from datetime import datetime

app = FastAPI()

# 1. Connect to a local database file (it will create this file automatically)
conn = sqlite3.connect('toxic_logs.db', check_same_thread=False)
cursor = conn.cursor()

# 2. Create a Table to store the exact time a comment gets blocked
cursor.execute('''
    CREATE TABLE IF NOT EXISTS blocked_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL
    )
''')

# Create a Table to store reported mistakes (False Positives)
cursor.execute('''
    CREATE TABLE IF NOT EXISTS reported_mistakes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        score REAL,
        timestamp TEXT NOT NULL
    )
''')
conn.commit()

mistakes_csv_path = "mistakes.csv"
if not os.path.exists(mistakes_csv_path):
    with open(mistakes_csv_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["text", "score", "timestamp"])

# 3. Create an endpoint so the frontend can ask for the stats!
@app.get("/stats")
def get_stats():
    # Count how many comments total have been blocked
    cursor.execute("SELECT COUNT(*) FROM blocked_comments")
    total_blocked = cursor.fetchone()[0]
    
    return {"total_blocked": total_blocked}


# ADD THIS TO ALLOW THE CHROME EXTENSION TO TALK TO THE API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In a real app this is unsafe, but fine for testing locally
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

with open("my_model.pkl", "rb") as f:
    model = pickle.load(f)

class BatchRequest(BaseModel):
    texts: List[str]
@app.post("/predict_batch")
def predict_batch(request: BatchRequest):
    if not request.texts:
        return {"results": []}

    # 1. Defeating Leetspeak (Preprocessing)
    # Trolls use numbers and symbols to bypass AI datasets (e.g. 1d10t -> idiot)
    def clean_leetspeak(text: str) -> str:
        text = text.lower()
        replacements = {"@":"a", "1":"i", "0":"o", "3":"e", "$":"s", "5":"s", "4":"a", "8":"b", "!":"i"}
        for k, v in replacements.items():
            text = text.replace(k, v)
        return text
        
    cleaned_texts = [clean_leetspeak(t) for t in request.texts]

    # 2. Use predict_proba() on the CLEANED texts instead of original texts
    probabilities = model.predict_proba(cleaned_texts)
    
    results_list = []
    for i in range(len(request.texts)):
        # Extract the toxic percentage! (e.g., 0.92 = 92% toxic)
        score = float(probabilities[i][1]) 
        
        # NEW LOGIC: Log this to the database if it is over 75% toxic
        if score >= 0.75:
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("INSERT INTO blocked_comments (timestamp) VALUES (?)", (now,))
            conn.commit()
            
        results_list.append({
            "text": request.texts[i],
            "score": score
        })
        
    return {"results": results_list}


class ReportRequest(BaseModel):
    text: str
    score: float

@app.post("/report_mistake")
def report_mistake(request: ReportRequest):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO reported_mistakes (text, score, timestamp) VALUES (?, ?, ?)",
        (request.text, request.score, now)
    )
    conn.commit()

    # Also save the mistake into mistakes.csv for future training.
    with open(mistakes_csv_path, "a", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([request.text, request.score, now])

    return {"status": "success", "message": "Mistake reported successfully."}
