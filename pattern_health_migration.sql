-- =============================================================
-- pattern_health_migration.sql
-- Additive-only migration for Pattern Health feature.
-- NEVER drops, renames, or alters existing columns or tables.
-- Safe to run on live Supabase project with zero downtime.
--
-- Run order:
--   1. pattern_health_migration.sql   (this file)
--   2. pattern_health_rpc.sql
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- TABLE 1: problem_topics  (normalised join table)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS problem_topics (
  problem_id  uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  topic       text NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (problem_id, topic)
);

ALTER TABLE problem_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own problem_topics"
  ON problem_topics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own problem_topics"
  ON problem_topics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policy: intentionally append-only.
-- The ON DELETE CASCADE on problem_id handles row cleanup when a problem is deleted.
-- If an update were needed, insert a corrected row (ON CONFLICT DO NOTHING won't help,
-- so the caller would delete + re-insert). For this feature, topics are set once on add.


-- ─────────────────────────────────────────────────────────────
-- BACKFILL problem_topics from problems.topics[]
--
-- Fixes applied:
--   #1 (COALESCE): not needed here — no timestamp, just strings.
--   #2 (trim / empty-filter): trims whitespace, skips empty strings
--      to guard against auto-fetch artifacts like ["Array", "Array ", ""].
-- ─────────────────────────────────────────────────────────────
INSERT INTO problem_topics (problem_id, topic, user_id)
SELECT
  p.id,
  trim(t.topic)   AS topic,
  p.user_id
FROM problems p
CROSS JOIN LATERAL unnest(p.topics) AS t(topic)
WHERE
  p.topics IS NOT NULL
  AND array_length(p.topics, 1) > 0
  AND trim(t.topic) != ''
ON CONFLICT DO NOTHING;

-- Verification (run manually after INSERT to confirm):
--   SELECT count(*) FROM problem_topics;
--   SELECT count(DISTINCT problem_id) FROM problem_topics;


-- ─────────────────────────────────────────────────────────────
-- TABLE 2: topic_activity  (append-only event log)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topic_activity (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topic       text        NOT NULL,
  problem_id  uuid        REFERENCES problems(id) ON DELETE SET NULL,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity    text        NOT NULL CHECK (activity IN ('solved', 'revised')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE topic_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own topic_activity"
  ON topic_activity FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own topic_activity"
  ON topic_activity FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE / DELETE policy: intentionally append-only event log.
-- Activity rows are immutable historical facts. If a correction is ever needed,
-- insert a new row rather than editing an old one.
-- Supabase defaults deny UPDATE/DELETE for unlisted operations — this is correct
-- and intentional, not an oversight.


-- ─────────────────────────────────────────────────────────────
-- BACKFILL topic_activity with first-solve events
--
-- Fix #1 applied: COALESCE(p.solved_date, p.created_at, now())
--   Guards against NULL solved_date (problems added before the column
--   existed, or edge cases). A NULL timestamp would cause MAX() over
--   topic_activity to return a valid value only for other rows, but
--   a topic where ALL rows have NULL timestamps would show as never
--   practiced — silently invisible to the whole feature.
--   Using COALESCE ensures every backfill row gets a valid timestamp.
--
-- Fix #2 applied: same trim/empty-filter as problem_topics backfill.
-- ─────────────────────────────────────────────────────────────
INSERT INTO topic_activity (topic, problem_id, user_id, activity, occurred_at)
SELECT
  trim(t.topic)                                         AS topic,
  p.id                                                  AS problem_id,
  p.user_id,
  'solved'                                              AS activity,
  COALESCE(p.solved_date, p.created_at, now())          AS occurred_at
FROM problems p
CROSS JOIN LATERAL unnest(p.topics) AS t(topic)
WHERE
  p.topics IS NOT NULL
  AND array_length(p.topics, 1) > 0
  AND trim(t.topic) != ''
ON CONFLICT DO NOTHING;

-- Verification (run manually after INSERT to confirm zero NULLs):
--   SELECT count(*) FROM topic_activity;
--   SELECT count(*) FROM topic_activity WHERE occurred_at IS NULL;  -- must be 0
--   SELECT topic, count(*) FROM topic_activity GROUP BY topic ORDER BY count DESC LIMIT 20;
