-- Restore workflow_logs observability table (Member 2 · task 2.1).
-- Decision: restore (not strip log nodes). n8n workflows POST via service-role Supabase
-- custom auth; authenticated users may read their team's logs only.

create table if not exists public.workflow_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  workflow_name text not null,
  step text not null,
  result text not null,
  payload jsonb not null default '{}'::jsonb,
  error text,
  "timestamp" timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists workflow_logs_team_id_idx on public.workflow_logs (team_id);
create index if not exists workflow_logs_workspace_id_idx on public.workflow_logs (workspace_id);
create index if not exists workflow_logs_team_timestamp_idx on public.workflow_logs (team_id, "timestamp" desc);
create index if not exists workflow_logs_timestamp_idx on public.workflow_logs ("timestamp" desc);

drop trigger if exists trg_workflow_logs_team_from_workspace on public.workflow_logs;
create trigger trg_workflow_logs_team_from_workspace
before insert or update of workspace_id on public.workflow_logs for each row
execute function public.sync_team_id_from_workspace();

alter table public.workflow_logs enable row level security;

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

-- Read-only for authenticated team members (dashboard / logs UI).
create policy "team_members_select_workflow_logs" on public.workflow_logs for
select to authenticated using (team_id = (select private.current_team_id()));

-- Writes are service-role only (n8n Supabase custom auth). No insert/update/delete for app users.
revoke all on table public.workflow_logs from anon;
revoke insert, update, delete on table public.workflow_logs from authenticated;
grant select on table public.workflow_logs to authenticated;
