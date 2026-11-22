-- Wave 2 G3 — Chat confirmation-gated People proposals.
-- Tools persist pending rows. Confirm/cancel APIs execute via lib/people services.
-- Tenant root is teams/workspaces. Chat never sends email.

create table if not exists public.chat_proposed_actions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  kind text not null
    check (kind in ('set_pipeline_stage', 'set_employment_status')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'expired', 'failed')),
  payload jsonb not null default '{}'::jsonb,
  summary text not null,
  created_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.chat_proposed_actions is
  'Chat People proposals. Tools insert status=pending; Confirm/Cancel APIs mutate. User text cannot confirm.';

create index if not exists chat_proposed_actions_team_session_created_idx
  on public.chat_proposed_actions (team_id, session_id, created_at desc);

create index if not exists chat_proposed_actions_team_status_idx
  on public.chat_proposed_actions (team_id, status);

drop trigger if exists trg_chat_proposed_actions_set_team_from_workspace
  on public.chat_proposed_actions;
create trigger trg_chat_proposed_actions_set_team_from_workspace
  before insert or update of workspace_id on public.chat_proposed_actions
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_chat_proposed_actions_updated_at
  on public.chat_proposed_actions;
create trigger trg_chat_proposed_actions_updated_at
  before update on public.chat_proposed_actions
  for each row
  execute function public.handle_chat_sessions_updated_at();

alter table public.chat_proposed_actions enable row level security;

drop policy if exists "chat_proposed_actions_select_team" on public.chat_proposed_actions;
drop policy if exists "chat_proposed_actions_insert_team" on public.chat_proposed_actions;
drop policy if exists "chat_proposed_actions_update_team" on public.chat_proposed_actions;

create policy "chat_proposed_actions_select_team" on public.chat_proposed_actions
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "chat_proposed_actions_insert_team" on public.chat_proposed_actions
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "chat_proposed_actions_update_team" on public.chat_proposed_actions
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

revoke all on table public.chat_proposed_actions from anon;
grant select, insert, update on table public.chat_proposed_actions to authenticated;
