-- Future production hardening migration.
--
-- Do not apply this file during the non-breaking hardening pass.
-- The live n8n workflows currently depend on the permissive demo policies in
-- supabase/migrations/0002_demo_api_policies.sql.
--
-- Apply only after:
-- 1. n8n has moved from direct anon Supabase REST calls to token-protected
--    /api/internal/n8n/* routes.
-- 2. Operational tables have a workspace_id backfill strategy.
-- 3. Route/API parity tests confirm the new workflow creates the same rows.

begin;

-- Example future direction, intentionally commented out:
--
-- revoke all on public.conversations from anon;
-- revoke all on public.leads from anon;
-- revoke all on public.reply_drafts from anon;
-- revoke all on public.followups from anon;
-- revoke all on public.workflow_logs from anon;
-- revoke all on public.daily_reports from anon;
--
-- drop policy if exists "demo anon can read conversations" on public.conversations;
-- drop policy if exists "demo anon can insert conversations" on public.conversations;
-- drop policy if exists "demo anon can update conversations" on public.conversations;
--
-- create policy "Workspace members read conversations"
--   on public.conversations for select
--   to authenticated
--   using (public.is_workspace_member(workspace_id));

rollback;
