-- Operational tables: RLS enabled, authenticated grants only.
-- Tenant isolation policies are defined in 20260526044701_workspace_scope_ops.sql
-- (after profiles + workspace_id exist). Service role bypasses RLS for n8n/internal routes.

alter table public.business_profiles enable row level security;

alter table public.conversations enable row level security;

alter table public.leads enable row level security;

alter table public.reply_drafts enable row level security;

alter table public.followups enable row level security;

alter table public.workflow_logs enable row level security;

alter table public.daily_reports enable row level security;

grant usage on schema public to authenticated;

revoke all on schema public from anon;

grant
select,
insert,
update,
delete on table public.business_profiles to authenticated;

grant
select,
insert,
update,
delete on table public.conversations to authenticated;

grant
select,
insert,
update,
delete on table public.leads to authenticated;

grant
select,
insert,
update,
delete on table public.reply_drafts to authenticated;

grant
select,
insert,
update,
delete on table public.followups to authenticated;

grant
select,
insert on table public.workflow_logs to authenticated;

grant
select,
insert,
update on table public.daily_reports to authenticated;

revoke all on table public.business_profiles from anon;

revoke all on table public.conversations from anon;

revoke all on table public.leads from anon;

revoke all on table public.reply_drafts from anon;

revoke all on table public.followups from anon;

revoke all on table public.workflow_logs from anon;

revoke all on table public.daily_reports from anon;
