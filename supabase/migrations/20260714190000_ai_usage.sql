-- AI cost/usage tracking (Member 4 · task 4.4).
-- n8n workflows POST via service-role internal endpoint; authenticated users read their team's rows only.

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workflow_name text not null,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_team_id_idx on public.ai_usage (team_id);
create index if not exists ai_usage_team_created_idx on public.ai_usage (team_id, created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists "team_members_select_ai_usage" on public.ai_usage;

create policy "team_members_select_ai_usage" on public.ai_usage for
select to authenticated using (team_id = (select private.current_team_id()));

-- Writes are service-role only (n8n internal endpoint). No insert/update/delete for app users.
revoke all on table public.ai_usage from anon;
revoke insert, update, delete on table public.ai_usage from authenticated;
grant select on table public.ai_usage to authenticated;
