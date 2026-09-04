-- Append-only tenant audit log (Wave 1 A1).
-- Authenticated members may SELECT their team and INSERT as themselves.
-- No UPDATE/DELETE policies. Future system writes (null actor) use service role.

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  domain text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  prev_state jsonb,
  next_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.audit_events is
  'Append-only tenant audit trail and People activity timeline. Do not add people_activity.';

create index if not exists audit_events_team_created_idx
  on public.audit_events (team_id, created_at desc);

create index if not exists audit_events_team_entity_idx
  on public.audit_events (team_id, entity_type, entity_id);

alter table public.audit_events enable row level security;

drop policy if exists "audit_events_select_team" on public.audit_events;
drop policy if exists "audit_events_insert_team" on public.audit_events;

create policy "audit_events_select_team" on public.audit_events
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "audit_events_insert_team" on public.audit_events
  for insert to authenticated
  with check (
    team_id = (select private.current_team_id())
    and actor_user_id = (select auth.uid())
  );

revoke all on table public.audit_events from anon;
revoke update, delete on table public.audit_events from authenticated;
grant select, insert on table public.audit_events to authenticated;
