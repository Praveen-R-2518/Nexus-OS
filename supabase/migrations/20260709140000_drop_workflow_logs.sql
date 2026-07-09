-- Remove workflow_logs observability table (feature retired).

drop trigger if exists trg_workflow_logs_team_from_workspace on public.workflow_logs;

drop policy if exists "team_members_select_workflow_logs" on public.workflow_logs;
drop policy if exists "team_members_insert_workflow_logs" on public.workflow_logs;
drop policy if exists "team_members_update_workflow_logs" on public.workflow_logs;
drop policy if exists "team_members_delete_workflow_logs" on public.workflow_logs;
drop policy if exists "workflow_logs_org_isolation" on public.workflow_logs;
drop policy if exists "workflow_logs_team_access" on public.workflow_logs;
drop policy if exists "workspace_members_read_workflow_logs" on public.workflow_logs;
drop policy if exists "workspace_members_insert_workflow_logs" on public.workflow_logs;
drop policy if exists "demo anon can read workflow logs" on public.workflow_logs;
drop policy if exists "demo anon can insert workflow logs" on public.workflow_logs;
drop policy if exists "allow_all_workflow_logs" on public.workflow_logs;

revoke all on table public.workflow_logs from authenticated;
revoke all on table public.workflow_logs from anon;

drop index if exists public.workflow_logs_team_id_idx;
drop index if exists public.workflow_logs_workspace_id_idx;
drop index if exists public.workflow_logs_team_timestamp_idx;
drop index if exists public.workflow_logs_timestamp_idx;

drop table if exists public.workflow_logs cascade;
