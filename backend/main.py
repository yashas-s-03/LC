from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from supabase import create_client, Client
import os
from pathlib import Path
from dotenv import load_dotenv

try:
    import backend.logic as logic
except ImportError:
    import logic
import urllib.request
import json
import re

class FetchRequest(BaseModel):
    url: str

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

class NoteUpdate(BaseModel):
    notes: str
    user_id: str

class RevisionRequest(BaseModel):
    user_id: str

@app.get("/")
def read_root():
    return {"status": "ok", "message": "LeetCode Revision Backend is running"}

@app.post("/problems")
def add_problem(problem: ProblemCreate):
    data = problem.dict()
    
    # Logic: When adding a problem, we just solved it.
    # Next revision should be in 3 days (Interval for 0 revisions).
    # We should NOT see it in "Due" immediately.
    
    now = datetime.now()
    # Interval for 0 is 3 days
    next_date = now + timedelta(days=3) 
    
    data["created_at"] = now.isoformat()
    data["solved_date"] = now.isoformat()
    data["next_revision_date"] = next_date.isoformat()
    data["revision_count"] = 0
    
    # Let Supabase handle the ID generation and default dates
    response = supabase.table("problems").insert(data).execute()
    return response.data

@app.delete("/problems/{problem_id}")
def delete_problem(problem_id: str, user_id: str): # passing user_id as query param for simple verification
    # 1. Verify ownership
    problem = supabase.table("problems").select("*").eq("id", problem_id).execute()
    if not problem.data:
        raise HTTPException(status_code=404, detail="Problem not found")
        
    if problem.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this problem")

    # 2. Delete
    response = supabase.table("problems").delete().eq("id", problem_id).execute()
    return {"message": "Problem deleted successfully", "data": response.data}

@app.get("/problems")
def get_all_problems(user_id: str):
    response = supabase.table("problems").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return response.data

@app.get("/dashboard")
def get_dashboard(user_id: str):
    # Fetch problems where user_id matches and next_revision_date IS DUE.
    # User requested: "time does not matter just like after some days"
    # Logic: if next_revision_date <= End of Today, it is due.
    
    # Get the end of the current day (local time approx, or UTC, keeping simple with server time)
    # If standard ISO string "2023-10-25T14:00:00"
    # We want to match anything where the date part is <= today.
    # In ISO string comparison: "2023-10-25..." <= "2023-10-25T23:59:59"
    
    todays_date = datetime.now().date()
    end_of_today = datetime.combine(todays_date, datetime.max.time())
    cutoff_iso = end_of_today.isoformat()
    
    response = supabase.table("problems")\
        .select("*")\
        .eq("user_id", user_id)\
        .lte("next_revision_date", cutoff_iso)\
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
    


    # Actually, keep it simple.
    now = datetime.now()
    # Use (current + 1) because we are establishing the interval for the NEXT stage.
    # Count 0 -> 1 (We want the interval for having 1 revision, which is 7 days)
    next_date_full = logic.calculate_next_revision(now, current_revision_count + 1)
    
    # 3. Update DB
    update_data = {
        "revision_count": current_revision_count + 1,
        "next_revision_date": next_date_full.isoformat(),
        "solved_date": now.isoformat() # Optional: update 'last interaction'
    }
    
    response = supabase.table("problems").update(update_data).eq("id", problem_id).execute()
    return response.data

@app.patch("/problems/{problem_id}/notes")
def update_problem_note(problem_id: str, request: NoteUpdate):
    # 1. Verify ownership (optional but good practice)
    # For speed, we might just rely on the query filtering by user_id if we did RLS, 
    # but here we manual check or just trust the update logic + user_id match if we wanted to be strict.
    
    # Simple check:
    problem_response = supabase.table("problems").select("user_id").eq("id", problem_id).execute()
    if not problem_response.data:
        raise HTTPException(status_code=404, detail="Problem not found")
    
    if problem_response.data[0]["user_id"] != request.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # 2. Update
    response = supabase.table("problems").update({"notes": request.notes}).eq("id", problem_id).execute()
    return response.data

@app.post("/fetch-leetcode")
def fetch_leetcode_data(request: FetchRequest):
    url = request.url
    slug = None
    
    # Check if input is purely numeric (e.g. "3775")
    if re.match(r"^\d+$", url.strip()):
        search_term = url.strip()
        # 1. Search to find slug
        search_query = """
        query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
          problemsetQuestionList: questionList(
            categorySlug: $categorySlug
            limit: $limit
            skip: $skip
            filters: $filters
          ) {
            questions: data {
              frontendQuestionId: questionFrontendId
              title
              titleSlug
            }
          }
        }
        """
        search_payload = {
            "query": search_query,
            "variables": {
                "categorySlug": "",
                "limit": 1,
                "skip": 0,
                "filters": {"searchKeywords": search_term}
            }
        }
        
        # Helper to make request (simplified inline)
        req = urllib.request.Request(
            "https://leetcode.com/graphql", 
            data=json.dumps(search_payload).encode('utf-8'),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
        )
        try:
            with urllib.request.urlopen(req) as f:
                resp = json.load(f)
                questions = resp.get("data", {}).get("problemsetQuestionList", {}).get("questions", [])
                # Verify match (LeetCode search is fuzzy, ensure ID matches if possible, or take first)
                found = None
                for q in questions:
                    if q["frontendQuestionId"] == search_term:
                        found = q
                        break
                if not found and questions:
                    found = questions[0] # Fallback to best match
                    
                if found:
                    slug = found["titleSlug"]
        except Exception as e:
            print(f"Search Error: {e}")
            pass

    if not slug:
        # Fallback to URL parsing
        match = re.search(r"/problems/([^/?]+)", url)
        if match:
            slug = match.group(1)
        elif not re.match(r"^\d+$", url.strip()): 
             # If it wasn't numeric and regex failed (maybe just a slug was passed directly?)
             # Let's assume the input *is* the slug if it looks like one (no spaces, no slashes)
             if re.match(r"^[a-z0-9-]+$", url.strip()):
                 slug = url.strip()
             else:
                 raise HTTPException(status_code=400, detail="Invalid LeetCode URL or ID")
        else:
             raise HTTPException(status_code=404, detail="Problem ID not found")

    # GraphQL Query
    query = """
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        difficulty
        topicTags {
          name
        }
      }
    }
    """
    
    payload = {
        "query": query,
        "variables": {"titleSlug": slug}
    }
    
    # Request
    req = urllib.request.Request(
        "https://leetcode.com/graphql", 
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
    )
    
    try:
        with urllib.request.urlopen(req) as f:
            resp = json.load(f)
            if "errors" in resp:
                raise HTTPException(status_code=400, detail="LeetCode API Error")
            q = resp.get("data", {}).get("question")
            if not q:
                raise HTTPException(status_code=404, detail="Problem not found")
                
            return {
                "title": q["title"],
                "url": f"https://leetcode.com/problems/{slug}/",
                "difficulty": q["difficulty"],
                "topics": [t["name"] for t in q["topicTags"]]
            }
    except Exception as e:
        print(f"Fetch Error: {e}")
        # Improve error handling for user
        raise HTTPException(status_code=500, detail="Failed to fetch from LeetCode")
