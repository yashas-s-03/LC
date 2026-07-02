-- =============================================================
-- leetcode_sync_migration.sql
-- Additive-only migration for LeetCode Auto-Sync feature.
-- Run AFTER pattern_health_migration.sql and pattern_health_rpc.sql.
-- Safe to re-run (all statements are idempotent).
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Extend problems table (additive columns only)
-- ─────────────────────────────────────────────────────────────

-- slug: LeetCode titleSlug (e.g. "two-sum"). Used for dedup lookup
-- during sync. Nullable for backward-compat with existing rows.
ALTER TABLE problems ADD COLUMN IF NOT EXISTS slug text;

-- source: tracks whether the problem was added manually or by auto-sync.
-- Default 'manual' keeps all existing rows correct without a backfill.
ALTER TABLE problems ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'auto_sync'));

-- needs_pattern_tag: true when the problem was auto-synced and only has
-- LeetCode's broad official tags (e.g. "Array") rather than the user's
-- own finer-grained pattern vocabulary. Prompts the user to add tags.
ALTER TABLE problems ADD COLUMN IF NOT EXISTS needs_pattern_tag boolean NOT NULL DEFAULT false;

-- Backfill slug from url for existing problems (best-effort).
-- Problems with no URL or non-standard URLs are left NULL — that's fine.
UPDATE problems
SET slug = (regexp_match(url, '/problems/([^/?#]+)'))[1]
WHERE url IS NOT NULL
  AND slug IS NULL
  AND url LIKE '%/problems/%';

-- Index for the dedup lookup in run_sync_for_user
CREATE INDEX IF NOT EXISTS idx_problems_user_slug ON problems(user_id, slug)
  WHERE slug IS NOT NULL;


-- ─────────────────────────────────────────────────────────────
-- 2. user_settings  (per-user LeetCode config)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  user_id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  leetcode_username   text,
  last_synced_at      timestamptz
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Single "all operations" policy: users can SELECT/INSERT/UPDATE/DELETE
-- their own row. No other user can see or touch it.
CREATE POLICY "Users manage own settings"
  ON user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 3. leetcode_sync_log  (dedup / audit log — append-only)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leetcode_sync_log (
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  leetcode_submission_id  text NOT NULL,
  processed_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, leetcode_submission_id)
);

ALTER TABLE leetcode_sync_log ENABLE ROW LEVEL SECURITY;

-- Read-only access for users (for their own rows, for transparency).
CREATE POLICY "Users see own sync log"
  ON leetcode_sync_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policy: only the backend service-role key
-- writes here. This is intentional — the sync log is an immutable audit
-- trail, not user-editable data. Direct INSERT attempts with the anon key
-- will be silently rejected by Supabase.


-- ─────────────────────────────────────────────────────────────
-- Verification queries (run manually after migration)
-- ─────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'problems'
--   ORDER BY ordinal_position;
-- -- Should show: slug, source, needs_pattern_tag among others

-- SELECT count(*) FROM problems WHERE slug IS NOT NULL;
-- -- Should equal the count of problems that have a valid LeetCode URL

-- SELECT count(*) FROM user_settings;     -- 0 until someone saves their username
-- SELECT count(*) FROM leetcode_sync_log; -- 0 until first sync run
