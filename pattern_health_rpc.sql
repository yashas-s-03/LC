-- =============================================================
-- pattern_health_rpc.sql
-- Postgres functions for Pattern Health feature.
-- Run AFTER pattern_health_migration.sql.
--
-- Functions:
--   1. get_pattern_health(p_user_id)
--      → Single query returning all topic health rows + stale_count.
--        Fix #4: stale_count is derived here so the frontend calls
--        this once and gets both pieces of data.
--
--   2. mark_problem_revised_with_activity(...)
--      → Atomically updates problems.next_revision_date AND inserts
--        topic_activity rows. Fix #3: both operations succeed or
--        neither does — no silent partial-commit corruption.
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- FUNCTION 1: get_pattern_health
--
-- Returns one row per topic the user has solved, sorted:
--   1. Overdue topics first (most overdue = largest overdue gap)
--   2. Then healthy topics sorted by soonest upcoming due date
--   3. Then alphabetically as final tiebreaker
--
-- The calling backend endpoint extracts stale_count from the result
-- set (count of rows where is_overdue = true) and wraps it into
-- {"topics": [...], "stale_count": N} so the frontend makes
-- exactly one API call for both the tab data and the header badge.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_pattern_health(p_user_id uuid)
RETURNS TABLE (
  topic           text,
  problem_count   bigint,
  last_practiced  timestamptz,
  interval_days   int,
  next_due        timestamptz,
  is_overdue      boolean,
  overdue_days    int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH distinct_problems AS (
    -- Count how many distinct problems a user has solved per topic.
    -- This drives the mastery-based interval calculation.
    SELECT
      pt.topic,
      COUNT(DISTINCT pt.problem_id) AS problem_count
    FROM problem_topics pt
    WHERE pt.user_id = p_user_id
    GROUP BY pt.topic
  ),
  last_activity AS (
    -- Find the last time the user exercised each topic (solve or revise).
    SELECT
      ta.topic,
      MAX(ta.occurred_at) AS last_practiced
    FROM topic_activity ta
    WHERE ta.user_id = p_user_id
    GROUP BY ta.topic
  ),
  computed AS (
    SELECT
      dp.topic,
      dp.problem_count,
      la.last_practiced,
      -- Mastery-based interval (not a fixed schedule):
      --   1 problem  → 14 days  (just started, check back soon)
      --   2–4        → 30 days  (some exposure)
      --   5–9        → 60 days  (solid coverage)
      --   10+        → 90 days  (well-consolidated)
      CASE
        WHEN dp.problem_count = 1                    THEN 14
        WHEN dp.problem_count BETWEEN 2 AND 4        THEN 30
        WHEN dp.problem_count BETWEEN 5 AND 9        THEN 60
        ELSE                                              90
      END AS interval_days,
      la.last_practiced
        + (CASE
            WHEN dp.problem_count = 1                THEN 14
            WHEN dp.problem_count BETWEEN 2 AND 4    THEN 30
            WHEN dp.problem_count BETWEEN 5 AND 9    THEN 60
            ELSE                                          90
           END) * INTERVAL '1 day'                   AS next_due
    FROM distinct_problems dp
    LEFT JOIN last_activity la ON la.topic = dp.topic
  )
  SELECT
    c.topic,
    c.problem_count,
    c.last_practiced,
    c.interval_days,
    c.next_due,
    -- is_overdue: true when current time has passed next_due.
    -- Handles NULL next_due (no activity yet) as overdue=false.
    COALESCE(now() > c.next_due, false)                            AS is_overdue,
    -- overdue_days: whole days past due. 0 when not overdue.
    GREATEST(0, EXTRACT(DAY FROM (now() - c.next_due))::int)       AS overdue_days
  FROM computed c
  ORDER BY
    -- Overdue topics first
    CASE WHEN now() > c.next_due THEN 0 ELSE 1 END ASC,
    -- Among overdue: most overdue (largest gap) first
    CASE WHEN now() > c.next_due THEN (now() - c.next_due) END DESC,
    -- Among healthy: soonest-due first
    CASE WHEN NOT (now() > c.next_due) THEN c.next_due END ASC,
    -- Final tiebreaker
    c.topic ASC;
$$;


-- ─────────────────────────────────────────────────────────────
-- FUNCTION 2: mark_problem_revised_with_activity
--
-- Fix #3: executes both side effects in one PL/pgSQL function so
-- they share a single transaction. Either both the problems UPDATE
-- and the topic_activity INSERTs succeed, or neither does.
-- The frontend never sees a state where the per-problem schedule
-- advanced but the topic activity was not logged.
--
-- Parameters:
--   p_problem_id  — the problem being revised
--   p_user_id     — verified owner (function checks this)
--   p_next_date   — pre-computed next_revision_date from backend logic.py
--   p_new_count   — revision_count + 1
--   p_now         — current timestamp (passed in so Python and Postgres agree)
--
-- Returns: the updated problem row (same shape as the previous
--          supabase.table("problems").update(...).execute() return value).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_problem_revised_with_activity(
  p_problem_id  uuid,
  p_user_id     uuid,
  p_next_date   timestamptz,
  p_new_count   int,
  p_now         timestamptz
)
RETURNS SETOF problems
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Update the per-problem spaced-repetition schedule.
  --    This is the existing behaviour — unchanged.
  UPDATE problems
  SET
    revision_count     = p_new_count,
    next_revision_date = p_next_date,
    solved_date        = p_now
  WHERE id = p_problem_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Problem % not found or not owned by user %', p_problem_id, p_user_id;
  END IF;

  -- 2. Insert a 'revised' activity row for every topic on this problem.
  --    If the problem has no rows in problem_topics (legacy problem that
  --    pre-dates the backfill), this is a silent no-op rather than an error.
  --    The per-problem revision still succeeds; the pattern log just misses
  --    this event, which is acceptable for pre-backfill data.
  INSERT INTO topic_activity (topic, problem_id, user_id, activity, occurred_at)
  SELECT
    pt.topic,
    p_problem_id,
    p_user_id,
    'revised',
    p_now
  FROM problem_topics pt
  WHERE pt.problem_id = p_problem_id
    AND pt.user_id    = p_user_id;

  -- 3. Return the updated problem row so the API response shape is identical
  --    to the previous supabase table update response.
  RETURN QUERY
    SELECT * FROM problems WHERE id = p_problem_id;
END;
$$;
