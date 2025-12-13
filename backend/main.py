from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from supabase import create_client, Client
import os
from pathlib import Path
from dotenv import load_dotenv

try:
    import backend.logic as logic
except ImportError:
    import logic

# Robustly find the .env file
# backend/main.py -> backend/ -> LC/ -> frontend/ -> .env
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / "frontend" / ".env"

print(f"Loading env from: {ENV_PATH}")
load_dotenv(dotenv_path=ENV_PATH)

url: str = os.environ.get("VITE_SUPABASE_URL")
# Use Service Role Key to bypass RLS for backend operations
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not key:
    print("CRITICAL WARNING: SUPABASE_SERVICE_ROLE_KEY or URL missing.")
    print("Please add SUPABASE_SERVICE_ROLE_KEY to your .env file.")

supabase: Client = create_client(url, key)

app = FastAPI()

# Allow frontend to access this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow Vercel (and other) domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Models
class ProblemCreate(BaseModel):
    user_id: str
    title: str
    url: Optional[str] = None
    difficulty: str
    topics: List[str] = []
    notes: Optional[str] = None

class RevisionRequest(BaseModel):
    user_id: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "LeetCode Revision Backend is running"}

@app.post("/problems")
def add_problem(problem: ProblemCreate):
    data = problem.dict()
    # Let Supabase handle the ID generation and default dates
    response = supabase.table("problems").insert(data).execute()
    # Check for errors strictly if response structure implies it, 
    # but supabase-py usually raises exception or returns data.
    return response.data

@app.get("/problems")
def get_all_problems(user_id: str):
    response = supabase.table("problems").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return response.data

@app.get("/dashboard")
def get_dashboard(user_id: str):
    # Fetch problems where user_id matches and next_revision_date <= now
    now_iso = datetime.now().isoformat()
    
    response = supabase.table("problems")\
        .select("*")\
        .eq("user_id", user_id)\
        .lte("next_revision_date", now_iso)\
        .execute()
        
    return response.data

@app.post("/revise/{problem_id}")
def mark_revised(problem_id: str, request: RevisionRequest):
    # 1. Get current problem state
    problem_response = supabase.table("problems").select("*").eq("id", problem_id).execute()
    if not problem_response.data:
        raise HTTPException(status_code=404, detail="Problem not found")
        
    problem = problem_response.data[0]
    
    # Verify ownership
    if problem["user_id"] != request.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # 2. Calculate next date
    current_revision_count = problem["revision_count"]
    # We parse the DB date string to a datetime object
    # Postgres format: 2023-10-27T10:00:00+00:00
    # For fail-safety, we calculate from NOW if the date is weird, but ideally we use solved_date or last revision
    # The logic function expects a datetime.
    
    # Simplified: Calculate from NOW for the next interval
    # (Standard spaced repetition usually simulates 'reviewing now')
    now = datetime.now()
    next_date = logic.calculate_next_revision(now, current_revision_count)
    
    # 3. Update DB
    update_data = {
        "revision_count": current_revision_count + 1,
        "next_revision_date": next_date.isoformat(),
        "solved_date": now.isoformat() # Optional: update 'last interaction'
    }
    
    response = supabase.table("problems").update(update_data).eq("id", problem_id).execute()
    return response.data
