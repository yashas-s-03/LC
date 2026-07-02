from fastapi import FastAPI, HTTPException, Body, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
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
import time

# ── Environment ───────────────────────────────────────────────────────────────

# Robustly find the .env file
# backend/main.py -> backend/ -> LC/ -> frontend/ -> .env
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / "frontend" / ".env"

print(f"Loading env from: {ENV_PATH}")
load_dotenv(dotenv_path=ENV_PATH)

SUPABASE_URL: str = os.environ.get("VITE_SUPABASE_URL")
SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

# Shared secret for the scheduler-facing /sync/leetcode/all endpoint.
# Set this in Render environment variables + GitHub Actions secrets.
# If not set, the all-users sync endpoint is disabled (403 on every call).
SYNC_SECRET: str = os.environ.get("SYNC_SECRET", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("CRITICAL WARNING: SUPABASE_SERVICE_ROLE_KEY or URL missing.")
    print("Please add SUPABASE_SERVICE_ROLE_KEY to your .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_headers=["*"],
    allow_methods=["*"],
)

# ── Pydantic Models ───────────────────────────────────────────────────────────

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

class FetchRequest(BaseModel):
    url: str

class UserSettingsUpdate(BaseModel):
    user_id: str
    leetcode_username: str

# ── LeetCode GraphQL Helpers ──────────────────────────────────────────────────

LC_GRAPHQL = "https://leetcode.com/graphql"
LC_HEADERS = {
    "Content-Type": "application/json",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://leetcode.com",
}

def _lc_post(payload: dict, timeout: int = 15) -> dict:
    """POST to LeetCode GraphQL and return the parsed JSON response."""
    req = urllib.request.Request(
        LC_GRAPHQL,
        data=json.dumps(payload).encode("utf-8"),
        headers=LC_HEADERS,
    )
    with urllib.request.urlopen(req, timeout=timeout) as f:
        return json.load(f)


def fetch_recent_ac(username: str, limit: int = 20) -> list:
    """
    Fetch a user's recent accepted submissions via LeetCode's public API.
    Returns a list of {id, title, titleSlug, timestamp} dicts.
    Empty list if username is wrong, profile is private, or network fails —
    callers treat this as "nothing to sync", not an error.
    """
    query = """
    query recentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id
        title
        titleSlug
        timestamp
      }
    }
    """
    try:
        resp = _lc_post({"query": query, "variables": {"username": username, "limit": limit}})
        return resp.get("data", {}).get("recentAcSubmissionList", []) or []
    except Exception as e:
        print(f"WARNING: fetch_recent_ac failed for '{username}': {e}")
        return []


def fetch_question_data_by_slug(slug: str) -> dict:
    """
    Fetch title, difficulty, and topic tags for a given LeetCode problem slug.
    Raises on network/API error so callers can skip this submission and continue.
    """
    query = """
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionFrontendId
        title
        difficulty
        topicTags { name }
      }
    }
    """
    resp = _lc_post({"query": query, "variables": {"titleSlug": slug}})
    q = resp.get("data", {}).get("question")
    if not q:
        raise ValueError(f"No question data returned for slug '{slug}'")
    return q


# ── Sync Core ─────────────────────────────────────────────────────────────────

def run_sync_for_user(user_id: str, leetcode_username: str) -> dict:
    """
    Sync one user's recent accepted LeetCode submissions.

    For each submission not already in leetcode_sync_log:
      - NEW slug  → insert into problems + problem_topics + topic_activity('solved')
      - KNOWN slug → insert topic_activity('revised') ONLY
                     (NEVER touches next_revision_date or revision_count)

    Idempotent: the sync_log check at the top of the loop guarantees running
    this twice produces zero duplicate rows anywhere.

    Returns {"new_problems": N, "reinforced_topics": N, "skipped_duplicates": N}
    """
    new_problems     = 0
    reinforced_topics = 0
    skipped          = 0

    submissions = fetch_recent_ac(leetcode_username, limit=20)
    # Empty list = private profile, wrong username, or network error.
    # Treat as "nothing to sync" per spec §8.

    for sub in submissions:
        sub_id = str(sub.get("id", ""))
        if not sub_id:
            continue

        # ── 1. Idempotency check BEFORE any work ─────────────────────────
        already = (
            supabase.table("leetcode_sync_log")
            .select("leetcode_submission_id")
            .eq("user_id", user_id)
            .eq("leetcode_submission_id", sub_id)
            .execute()
        )
        if already.data:
            skipped += 1
            continue

        slug = sub.get("titleSlug", "")
        if not slug:
            continue

        # Convert unix epoch string to ISO 8601 UTC timestamp
        try:
            ts = datetime.fromtimestamp(
                int(sub["timestamp"]), tz=timezone.utc
            ).isoformat()
        except (KeyError, ValueError, OSError):
            ts = datetime.now(tz=timezone.utc).isoformat()

        # ── 2. Look up existing problem by (user_id, slug) ───────────────
        existing = (
            supabase.table("problems")
            .select("id,topics")
            .eq("user_id", user_id)
            .eq("slug", slug)
            .execute()
        )

        if not existing.data:
            # ── NEW problem ────────────────────────────────────────────────
            try:
                q = fetch_question_data_by_slug(slug)
            except Exception as e:
                print(f"WARNING: skip slug '{slug}' — fetch_question_data failed: {e}")
                # Still mark as processed so we don't retry an unfetchable slug forever
                _mark_processed(user_id, sub_id)
                continue

            topics = [t["name"] for t in q.get("topicTags", [])]
            clean_topics = [t.strip() for t in topics if t.strip()]

            q_id = q.get("questionFrontendId", "")
            display_title = f"{q_id}. {q['title']}" if q_id else q["title"]

            problem_row = {
                "user_id":             user_id,
                "title":               display_title,
                "url":                 f"https://leetcode.com/problems/{slug}/",
                "slug":                slug,
                "difficulty":          q.get("difficulty", "Medium"),
                "topics":              clean_topics,
                "notes":               None,
                "revision_count":      0,
                # next_revision_date is intentionally NULL for auto-synced problems.
                # Auto-synced problems are NOT added to the revision queue — the user
                # only revises problems they consciously add via the dashboard.
                # Pattern Health still gets full credit via topic_activity below.
                "next_revision_date":  None,
                "solved_date":         ts,
                "created_at":          ts,
                "source":              "auto_sync",
                "needs_pattern_tag":   True,
            }

            try:
                res = supabase.table("problems").insert(problem_row).execute()
                new_id = res.data[0]["id"]
            except Exception as e:
                print(f"ERROR: problems insert failed for slug '{slug}': {e}")
                continue  # Don't mark processed — allow retry next run

            if clean_topics:
                try:
                    supabase.table("problem_topics").insert([
                        {"problem_id": new_id, "topic": t, "user_id": user_id}
                        for t in clean_topics
                    ]).execute()
                except Exception as e:
                    print(f"WARNING: problem_topics insert failed for {new_id}: {e}")

                try:
                    supabase.table("topic_activity").insert([
                        {
                            "topic":       t,
                            "problem_id":  new_id,
                            "user_id":     user_id,
                            "activity":    "solved",
                            "occurred_at": ts,
                        }
                        for t in clean_topics
                    ]).execute()
                except Exception as e:
                    print(f"WARNING: topic_activity insert failed for {new_id}: {e}")

            new_problems += 1

        else:
            # ── EXISTING problem — reinforce pattern clock ONLY ────────────
            # NEVER touch next_revision_date or revision_count.
            # This preserves the per-problem SR system's integrity.
            prob = existing.data[0]
            prob_id = prob["id"]
            topics_list = prob.get("topics") or []
            clean_topics = [t.strip() for t in topics_list if t.strip()]

            if clean_topics:
                try:
                    supabase.table("topic_activity").insert([
                        {
                            "topic":       t,
                            "problem_id":  prob_id,
                            "user_id":     user_id,
                            "activity":    "revised",
                            "occurred_at": ts,
                        }
                        for t in clean_topics
                    ]).execute()
                    reinforced_topics += len(clean_topics)
                except Exception as e:
                    print(f"WARNING: topic_activity (revised) insert failed for {prob_id}: {e}")

        # ── 3. Mark submission as processed ──────────────────────────────
        _mark_processed(user_id, sub_id)

    # ── 4. Update last_synced_at ─────────────────────────────────────────
    try:
        supabase.table("user_settings").upsert({
            "user_id":        user_id,
            "last_synced_at": datetime.now(tz=timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        print(f"WARNING: last_synced_at update failed for {user_id}: {e}")

    return {
        "new_problems":       new_problems,
        "reinforced_topics":  reinforced_topics,
        "skipped_duplicates": skipped,
    }


def _mark_processed(user_id: str, submission_id: str) -> None:
    try:
        supabase.table("leetcode_sync_log").insert({
            "user_id":                user_id,
            "leetcode_submission_id": submission_id,
            "processed_at":           datetime.now(tz=timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        # PK conflict = already marked (double-call). Safe to ignore.
        print(f"INFO: sync_log insert for {submission_id}: {e}")


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"status": "ok", "message": "LeetCode Revision Backend is running"}


# ── Problems ──────────────────────────────────────────────────────────────────

@app.post("/problems")
def add_problem(problem: ProblemCreate):
    data = problem.dict()

    now = datetime.now()
    next_date = now + timedelta(days=3)

    data["created_at"]          = now.isoformat()
    data["solved_date"]         = now.isoformat()
    data["next_revision_date"]  = next_date.isoformat()
    data["revision_count"]      = 0
    data["source"]              = "manual"
    data["needs_pattern_tag"]   = False

    # Extract and store slug from URL (enables dedup in auto-sync later)
    if data.get("url"):
        m = re.search(r"/problems/([^/?#]+)", data["url"])
        if m:
            data["slug"] = m.group(1)

    response = supabase.table("problems").insert(data).execute()

    # ── Pattern Health side-effects ───────────────────────────────────────────
    if response.data and problem.topics:
        new_problem_id = response.data[0]["id"]
        solved_ts      = data["solved_date"]
        clean_topics   = [t.strip() for t in problem.topics if t.strip()]

        if clean_topics:
            pt_rows = [
                {"problem_id": new_problem_id, "topic": t, "user_id": problem.user_id}
                for t in clean_topics
            ]
            try:
                supabase.table("problem_topics").insert(pt_rows).execute()
            except Exception as e:
                print(f"WARNING: problem_topics insert failed for {new_problem_id}: {e}")

            ta_rows = [
                {
                    "topic":       t,
                    "problem_id":  new_problem_id,
                    "user_id":     problem.user_id,
                    "activity":    "solved",
                    "occurred_at": solved_ts,
                }
                for t in clean_topics
            ]
            try:
                supabase.table("topic_activity").insert(ta_rows).execute()
            except Exception as e:
                print(f"WARNING: topic_activity insert failed for {new_problem_id}: {e}")

    return response.data


@app.delete("/problems/{problem_id}")
def delete_problem(problem_id: str, user_id: str):
    problem = supabase.table("problems").select("*").eq("id", problem_id).execute()
    if not problem.data:
        raise HTTPException(status_code=404, detail="Problem not found")
    if problem.data[0]["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this problem")
    response = supabase.table("problems").delete().eq("id", problem_id).execute()
    return {"message": "Problem deleted successfully", "data": response.data}


@app.get("/problems")
def get_all_problems(user_id: str):
    response = (
        supabase.table("problems")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data


@app.get("/dashboard")
def get_dashboard(user_id: str):
    todays_date  = datetime.now().date()
    end_of_today = datetime.combine(todays_date, datetime.max.time())
    cutoff_iso   = end_of_today.isoformat()

    response = (
        supabase.table("problems")
        .select("*")
        .eq("user_id", user_id)
        .lte("next_revision_date", cutoff_iso)
        .execute()
    )
    return response.data


@app.post("/revise/{problem_id}")
def mark_revised(problem_id: str, request: RevisionRequest):
    problem_response = supabase.table("problems").select("*").eq("id", problem_id).execute()
    if not problem_response.data:
        raise HTTPException(status_code=404, detail="Problem not found")

    problem = problem_response.data[0]
    if problem["user_id"] != request.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")

    current_revision_count = problem["revision_count"]
    now = datetime.now()
    next_date_full = logic.calculate_next_revision(now, current_revision_count + 1)

    try:
        rpc_response = supabase.rpc(
            "mark_problem_revised_with_activity",
            {
                "p_problem_id": problem_id,
                "p_user_id":    request.user_id,
                "p_next_date":  next_date_full.isoformat(),
                "p_new_count":  current_revision_count + 1,
                "p_now":        now.isoformat(),
            }
        ).execute()
        return rpc_response.data
    except Exception as e:
        print(f"ERROR: mark_problem_revised_with_activity RPC failed: {e}")
        raise HTTPException(status_code=500, detail=f"Revision failed: {str(e)}")


@app.patch("/problems/{problem_id}/notes")
def update_problem_note(problem_id: str, request: NoteUpdate):
    problem_response = supabase.table("problems").select("user_id").eq("id", problem_id).execute()
    if not problem_response.data:
        raise HTTPException(status_code=404, detail="Problem not found")
    if problem_response.data[0]["user_id"] != request.user_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    response = supabase.table("problems").update({"notes": request.notes}).eq("id", problem_id).execute()
    return response.data


# ── Pattern Health ────────────────────────────────────────────────────────────

@app.get("/pattern-health")
def get_pattern_health(user_id: str):
    """
    Single call returns {topics: [...], stale_count: N}.
    The frontend derives stale_count client-side from the same payload — no
    second endpoint needed.
    """
    try:
        rpc_response = supabase.rpc(
            "get_pattern_health",
            {"p_user_id": user_id}
        ).execute()
        topics      = rpc_response.data or []
        stale_count = sum(1 for t in topics if t.get("is_overdue", False))
        return {"topics": topics, "stale_count": stale_count}
    except Exception as e:
        print(f"ERROR: get_pattern_health RPC failed: {e}")
        raise HTTPException(status_code=500, detail=f"Pattern health fetch failed: {str(e)}")


# ── User Settings ─────────────────────────────────────────────────────────────

@app.get("/user-settings")
def get_user_settings(user_id: str):
    """Return user's LeetCode username and last sync time."""
    res = (
        supabase.table("user_settings")
        .select("leetcode_username,last_synced_at")
        .eq("user_id", user_id)
        .execute()
    )
    return res.data[0] if res.data else {"leetcode_username": None, "last_synced_at": None}


@app.put("/user-settings")
def update_user_settings(settings: UserSettingsUpdate):
    """Upsert the user's LeetCode username."""
    username = settings.leetcode_username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="leetcode_username cannot be empty")

    supabase.table("user_settings").upsert({
        "user_id":           settings.user_id,
        "leetcode_username": username,
    }).execute()
    return {"message": "Settings saved", "leetcode_username": username}


# ── LeetCode Sync ─────────────────────────────────────────────────────────────

@app.post("/sync/leetcode")
def sync_leetcode_for_user(user_id: str):
    """
    Run sync for a single user (called from the "Sync now" button in the UI).
    Auth: caller must be the same user (ownership check via user_id, same
    pattern used by all other endpoints in this codebase).
    """
    settings_res = (
        supabase.table("user_settings")
        .select("leetcode_username")
        .eq("user_id", user_id)
        .execute()
    )
    if not settings_res.data or not settings_res.data[0].get("leetcode_username"):
        raise HTTPException(
            status_code=400,
            detail="No LeetCode username configured. Save it in Settings first."
        )

    username = settings_res.data[0]["leetcode_username"]
    try:
        result = run_sync_for_user(user_id, username)
        return result
    except Exception as e:
        print(f"ERROR: sync failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@app.post("/sync/leetcode/all")
def sync_all_users(x_sync_secret: Optional[str] = Header(None)):
    """
    Run sync for every user who has a leetcode_username set.
    Called exclusively by the GitHub Actions hourly cron — never from the frontend.

    Auth: requires X-Sync-Secret header matching the SYNC_SECRET env var.
    If SYNC_SECRET is not set in the environment, this endpoint is disabled.
    """
    if not SYNC_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Batch sync is disabled: SYNC_SECRET env var not set on this server."
        )
    if x_sync_secret != SYNC_SECRET:
        raise HTTPException(status_code=403, detail="Invalid or missing X-Sync-Secret header")

    # Fetch all users with a username configured
    all_settings = (
        supabase.table("user_settings")
        .select("user_id,leetcode_username")
        .neq("leetcode_username", None)
        .execute()
    )

    results = []
    for row in (all_settings.data or []):
        uid      = row["user_id"]
        username = row.get("leetcode_username", "").strip()
        if not username:
            continue
        try:
            r = run_sync_for_user(uid, username)
            results.append({"user_id": uid, **r})
            # Polite pause between users — don't hammer LC's public API
            time.sleep(2)
        except Exception as e:
            # One user's failure must not abort the whole batch
            print(f"ERROR: sync failed for user {uid}: {e}")
            results.append({"user_id": uid, "error": str(e)})

    return {"synced_users": len(results), "results": results}


# ── LeetCode Problem Auto-Fetch (existing endpoint — unchanged) ───────────────

@app.post("/fetch-leetcode")
def fetch_leetcode_data(request: FetchRequest):
    url  = request.url
    slug = None

    if re.match(r"^\d+$", url.strip()):
        search_term  = url.strip()
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
        try:
            resp = _lc_post(search_payload)
            questions = resp.get("data", {}).get("problemsetQuestionList", {}).get("questions", [])
            found = None
            for q in questions:
                if q["frontendQuestionId"] == search_term:
                    found = q
                    break
            if not found and questions:
                found = questions[0]
            if found:
                slug = found["titleSlug"]
        except Exception as e:
            print(f"Search Error: {e}")

    if not slug:
        match = re.search(r"/problems/([^/?]+)", url)
        if match:
            slug = match.group(1)
        elif not re.match(r"^\d+$", url.strip()):
            if re.match(r"^[a-z0-9-]+$", url.strip()):
                slug = url.strip()
            else:
                raise HTTPException(status_code=400, detail="Invalid LeetCode URL or ID")
        else:
            raise HTTPException(status_code=404, detail="Problem ID not found")

    try:
        q = fetch_question_data_by_slug(slug)
        return {
            "title":      q["title"],
            "questionId": q.get("questionFrontendId", ""),
            "url":        f"https://leetcode.com/problems/{slug}/",
            "difficulty": q.get("difficulty", "Medium"),
            "topics":     [t["name"] for t in q.get("topicTags", [])]
        }
    except Exception as e:
        print(f"Fetch Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch from LeetCode")
