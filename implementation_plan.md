# Pattern Health — Implementation Plan

## Inspection Summary (Step 0 complete)

| Dimension | Finding |
|---|---|
| **Framework** | **Vite + React 19** (no Next.js). Single-page app, `react-router-dom` v7 for routing. |
| **Backend** | **FastAPI** (Python) deployed separately (Render / Heroku via Procfile). All API calls go to `VITE_API_URL`. |
| **Database / ORM** | **Supabase** (Postgres). Frontend uses the Supabase JS client (`@supabase/supabase-js`) only for **auth**. All data reads/writes go through the FastAPI backend using the service-role key. |
| **Auth** | Supabase Auth → GitHub OAuth. `user.id` is a UUID passed as a query/body param to every backend call. No JWT forwarding. |
| **`topics` field** | Stored as a **Postgres `text[]` (native array)** column on `problems`. No join table exists yet. |
| **Problem card** | [`ProblemCard.jsx`](file:///c:/Users/yasha/OneDrive/Desktop/resume/LC/frontend/src/components/ProblemCard.jsx) — shows title, difficulty badge (`.badge.Easy/Medium/Hard`), `status.label` (e.g. "Overdue (90d)"), revision count, and the purple-to-pink **"Mark Revised"** `btn-primary` button. |
| **"Add Problem" form** | [`AddProblemForm.jsx`](file:///c:/Users/yasha/OneDrive/Desktop/resume/LC/frontend/src/components/AddProblemForm.jsx) — POSTs to `POST /problems`. Debounced auto-fetch from LeetCode GraphQL fills `title`, `difficulty`, `topics`. |
| **"Mark Revised" action** | `ProblemCard.handleRevise()` → `POST /revise/{problem_id}`. Backend in [`main.py`](file:///c:/Users/yasha/OneDrive/Desktop/resume/LC/backend/main.py#L134-L166) reads current `revision_count`, calls `logic.calculate_next_revision(now, count+1)`, updates `next_revision_date`. |
| **Spaced-repetition schedule** | [`logic.py`](file:///c:/Users/yasha/OneDrive/Desktop/resume\LC\backend\logic.py): 0→3d, 1→7d, 2→15d, 3→30d, 4+→60d. **Will not be changed.** |
| **"Due for Revision" badge** | Line 444 of [`App.jsx`](file:///c:/Users/yasha/OneDrive/Desktop/resume/LC/frontend/src/App.jsx#L444) — inline `<span className="badge" style={{ background: '#ff4d4d', ...}}>🔔 {dueProblems.length}</span>`. |
| **Routing** | Two routes exist: `/login` and `/` (Dashboard). New tab will add `/patterns` as a protected route. |
| **No existing `problem_topics` or `topic_activity` tables** — must be created. |

---

## Open Questions (none that need blocking — assumptions documented below)

> [!IMPORTANT]
> **Assumption A — Auth in Pattern Health tab**: The new `/patterns` route will use the same `ProtectedRoute` wrapper and the same `user.id` passed to all backend calls. No auth changes.
>
> **Assumption B — No join table in `problems_topics` yet**: Topics are `text[]` on `problems`. We will create `problem_topics` and backfill from `problems.topics[]`. The original `topics text[]` column is **not dropped**.
>
> **Assumption C — Backend handles `topic_activity` inserts**: The FastAPI backend will insert into both new tables. The frontend sees zero schema changes.
>
> **Assumption D — "Stale patterns" badge placement**: It will appear next to the existing "Due for Revision 🔔 N" badge inside the action bar at the top of `Dashboard`, re-using the same `.badge` class with a distinct color (amber/orange to distinguish from the red urgency badge). No new badge component is needed.

---

## Proposed Changes

### Database Migrations

#### [NEW] `pattern_health_migration.sql`
Two additive tables + RLS policies + backfill + helper view.

```sql
-- 1. Normalized topic join table
CREATE TABLE IF NOT EXISTS problem_topics (
  problem_id  uuid REFERENCES problems(id) ON DELETE CASCADE,
  topic       text NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, topic)
);
ALTER TABLE problem_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own problem_topics" ON problem_topics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own problem_topics" ON problem_topics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own problem_topics" ON problem_topics FOR DELETE USING (auth.uid() = user_id);

-- 2. Backfill from existing problems.topics[]
INSERT INTO problem_topics (problem_id, topic, user_id)
SELECT id, unnest(topics), user_id
FROM problems
WHERE topics IS NOT NULL AND array_length(topics, 1) > 0
ON CONFLICT DO NOTHING;

-- 3. Activity log
CREATE TABLE IF NOT EXISTS topic_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text NOT NULL,
  problem_id  uuid REFERENCES problems(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity    text NOT NULL CHECK (activity IN ('solved', 'revised')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE topic_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own topic_activity" ON topic_activity FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own topic_activity" ON topic_activity FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Backfill topic_activity with first-solve events from problems table
INSERT INTO topic_activity (topic, problem_id, user_id, activity, occurred_at)
SELECT unnest(p.topics), p.id, p.user_id, 'solved', p.solved_date
FROM problems p
WHERE p.topics IS NOT NULL AND array_length(p.topics, 1) > 0
ON CONFLICT DO NOTHING;
```

> [!NOTE]
> `user_id` is added to both tables so the backend's service-role queries can filter by user without disabling RLS. This keeps the same security model as the existing `problems` table.

---

### Backend — [`main.py`](file:///c:/Users/yasha/OneDrive/Desktop/resume/LC/backend/main.py)

#### [MODIFY] `POST /problems` — additive side effect
After the existing `supabase.table("problems").insert(data).execute()`, also:
1. Insert rows into `problem_topics` for each topic.
2. Insert `'solved'` rows into `topic_activity` for each topic.

#### [MODIFY] `POST /revise/{problem_id}` — additive side effect
After the existing `supabase.table("problems").update(...)`, also:
1. Fetch the problem's topics from `problem_topics`.
2. Insert `'revised'` rows into `topic_activity` for each topic.

#### [NEW] `GET /pattern-health?user_id=...`
Returns a list of topic health objects. Single Supabase RPC or raw SQL query — **not N+1**.

The query logic (implemented as a Python-side aggregation or Supabase RPC):
```sql
WITH distinct_problems AS (
  SELECT pt.topic,
         COUNT(DISTINCT pt.problem_id) AS problem_count
  FROM   problem_topics pt
  WHERE  pt.user_id = :user_id
  GROUP  BY pt.topic
),
last_activity AS (
  SELECT ta.topic,
         MAX(ta.occurred_at) AS last_practiced
  FROM   topic_activity ta
  WHERE  ta.user_id = :user_id
  GROUP  BY ta.topic
)
SELECT
  dp.topic,
  dp.problem_count,
  la.last_practiced,
  CASE
    WHEN dp.problem_count = 1          THEN 14
    WHEN dp.problem_count BETWEEN 2 AND 4 THEN 30
    WHEN dp.problem_count BETWEEN 5 AND 9 THEN 60
    ELSE 90
  END AS interval_days,
  la.last_practiced + (CASE
    WHEN dp.problem_count = 1          THEN 14
    WHEN dp.problem_count BETWEEN 2 AND 4 THEN 30
    WHEN dp.problem_count BETWEEN 5 AND 9 THEN 60
    ELSE 90
  END || ' days')::interval AS next_due
FROM   distinct_problems dp
LEFT JOIN last_activity la ON la.topic = dp.topic
ORDER  BY next_due ASC NULLS FIRST;
```

The backend returns for each topic:
```json
{
  "topic": "Binary Search",
  "problem_count": 3,
  "last_practiced": "2026-04-15T10:00:00Z",
  "interval_days": 30,
  "next_due": "2026-05-15T10:00:00Z",
  "is_overdue": true,
  "overdue_days": 48
}
```

> [!NOTE]
> This is a **single SQL query** executed via `supabase.rpc()` or raw `supabase.postgrest` — not N+1. The Supabase Python client supports raw SQL through `supabase.rpc()` if we wrap this in a Postgres function, OR we can use the REST PostgREST query builder. Since the query is complex, we'll use a **Postgres function / RPC** named `get_pattern_health(p_user_id uuid)`.

#### [NEW] `GET /pattern-health/stale-count?user_id=...`
Returns `{"stale_count": N}` — used for the header badge. Calls the same RPC and counts `is_overdue == true` rows.

---

### Frontend — New Components

#### [NEW] `src/pages/PatternHealth.jsx`
Full Pattern Health tab page:
- Fetches `GET /pattern-health?user_id=...` on mount.
- Renders a grid of topic cards matching the existing `problem-card` visual style.
- Each card shows: topic name, problem count pill, overdue/healthy status badge, "Find a Problem →" link.
- Sort: most overdue first (largest `overdue_days`), then soonest-due, then healthy.
- Stretch: "⚠️ low coverage" indicator when `problem_count == 1`.
- Stretch: "Due in N days" shown on healthy cards.
- Uses existing CSS classes: `.problem-card`, `.badge`, `.badge.Easy`/etc., `.btn-primary`, `.btn-secondary`.

#### [MODIFY] `src/App.jsx`
1. Add `import PatternHealth from './pages/PatternHealth'` and a new `<Route path="/patterns" element={<ProtectedRoute><PatternHealth /></ProtectedRoute>} />`.
2. Add a nav tab to the `action-bar` header area: `"🧩 Patterns"` that links to `/patterns`, using same tab styling as difficulty tabs.
3. Add a second badge next to the "Due for Revision 🔔 N" badge — **"Patterns stale: N"** — by fetching from `GET /pattern-health/stale-count?user_id=...` once on load and storing in state. Uses the same `.badge` class, different background color (e.g. `#f59e0b` amber).

---

### CSS — [`src/index.css`](file:///c:/Users/yasha/OneDrive/Desktop/resume/LC/frontend/src/index.css)

Add styles for:
- `.pattern-card` — inherits from `.problem-card`, tweaks for topic cards (no "Mark Revised" button).
- `.pattern-healthy` badge style — green, similar to `.badge.Easy`.
- `.pattern-overdue` badge style — red, similar to existing `.badge.Hard` overdue styling.
- `.pattern-nav-tab` — same as existing `.tab` / `.difficulty-tabs` style.

---

### SQL Migration File

#### [NEW] `pattern_health_migration.sql` (at project root)
Contains all DDL + backfill SQL above, safe to run once against the live Supabase project.

#### [NEW] `pattern_health_rpc.sql`
Contains the `get_pattern_health(p_user_id uuid)` Postgres function to be created in Supabase.

---

## Verification Plan

### Manual Verification
1. Run the migration SQL in Supabase SQL editor — verify `problem_topics` and `topic_activity` are populated.
2. Open the app → `/patterns` → confirm tab renders with correct topics and overdue status.
3. Add a new problem → check `topic_activity` gets a `'solved'` row for each topic.
4. Click "Mark Revised" on an existing due problem → check `topic_activity` gets a `'revised'` row.
5. Verify existing `/` (dashboard) "Due for Revision" count and "Mark Revised" flow are fully unchanged.
6. Verify header shows second "Patterns stale: N" badge.

### No new external services introduced.
All new data lives in the existing Supabase project. No new env vars needed beyond what already exists (`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
