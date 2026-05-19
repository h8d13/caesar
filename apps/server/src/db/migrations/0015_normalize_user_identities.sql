-- Backfill: make stored identities match the canonical form enforced
-- at the /login boundary (LOWER + TRIM). Mirrors upstream Sharkord
-- commit 178ffc7, extended with TRIM to match canonicalIdentity().
--
-- Step 1: resolve collisions. If two rows differ only in case/whitespace
-- (e.g. "Alice" and "alice"), the lowercased UPDATE below would violate
-- users.identity UNIQUE. Pick a winner per canonical group (last login
-- wins, tiebreak on lowest id) and delete the rest. FK cascades handle
-- dependent rows (messages, files, roles, etc.).
WITH ranked AS (
  SELECT
    id,
    LOWER(TRIM(identity)) AS canonical_identity,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(identity))
      ORDER BY COALESCE(last_login_at, 0) DESC, id ASC
    ) AS row_number
  FROM users
)
DELETE FROM users
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE row_number > 1
);
--> statement-breakpoint
UPDATE users
SET identity = LOWER(TRIM(identity))
WHERE identity <> LOWER(TRIM(identity));
