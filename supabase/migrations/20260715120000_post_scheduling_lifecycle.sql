-- Post scheduling + simplified lifecycle.
--
-- Removes the approval gate from social posts (product decision 2026-07-15): posts go
-- straight from draft to scheduled/published without an approval queue. Adds the columns
-- and status values needed for direct publishing and scheduled publishing.
--
-- Additive + numbered per the migration rules — no prior migration is rewritten.

-- When the post is scheduled for a future publish. NULL for draft/published/failed.
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Human-readable reason a publish attempt failed (surfaced on the Failed board card).
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS publish_error text;

-- Retire the approval statuses on any existing rows before tightening the check.
-- 'pending_approval'/'approved' rows become plain drafts the founder can act on.
UPDATE public.social_posts
  SET status = 'draft'
  WHERE status IN ('pending_approval', 'approved');

-- Replace the lifecycle check: draft -> scheduled -> publishing -> published (+ failed).
-- 'publishing' is the transient state while WF8b talks to the platform APIs.
ALTER TABLE public.social_posts
  DROP CONSTRAINT IF EXISTS social_posts_status_check;
ALTER TABLE public.social_posts
  ADD CONSTRAINT social_posts_status_check
  CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed'));

-- Scheduler polls due posts by (org, status, scheduled_at); the board sorts scheduled
-- posts by scheduled_at. One composite index serves both.
CREATE INDEX IF NOT EXISTS social_posts_org_status_scheduled_idx
  ON public.social_posts (organization_id, status, scheduled_at);
