-- Chat Agent ("Revenue Analyst") history — additive, RLS-safe.
-- Two tenant-scoped tables the READ-ONLY analyst is allowed to write:
--   chat_sessions  — one conversation thread per founder session
--   chat_messages  — user/assistant turns within a session
-- Mirrors the meta_credentials RLS + team-from-workspace trigger pattern
-- (20260619120000_meta_unified_inbox_foundation.sql). RLS enabled from day one.

-- 1. chat_sessions -------------------------------------------------------------
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_team_id_idx
  on public.chat_sessions (team_id);

create index if not exists chat_sessions_workspace_id_idx
  on public.chat_sessions (workspace_id);

create index if not exists chat_sessions_team_recent_idx
  on public.chat_sessions (team_id, updated_at desc);

-- 2. chat_messages -------------------------------------------------------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx
  on public.chat_messages (session_id, created_at asc);

create index if not exists chat_messages_team_id_idx
  on public.chat_messages (team_id);

-- 3. Team-from-workspace stamping (mirrors trg_meta_credentials_set_team_from_workspace).
--    Only derives team_id from a non-null workspace_id; otherwise keeps the team_id the
--    app supplied (requireApiTenantContext can return a null workspace).
create or replace function public.trg_chat_set_team_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is not null then
    select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_sessions_set_team_from_workspace on public.chat_sessions;
create trigger trg_chat_sessions_set_team_from_workspace
  before insert or update of workspace_id on public.chat_sessions
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_chat_messages_set_team_from_workspace on public.chat_messages;
create trigger trg_chat_messages_set_team_from_workspace
  before insert or update of workspace_id on public.chat_messages
  for each row
  execute function public.trg_chat_set_team_from_workspace();

create or replace function public.handle_chat_sessions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chat_sessions_updated_at on public.chat_sessions;
create trigger trg_chat_sessions_updated_at
  before update on public.chat_sessions
  for each row
  execute function public.handle_chat_sessions_updated_at();

-- 4. RLS — tenant-scoped, team members read + write their own team's chat.
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_sessions_select_team" on public.chat_sessions;
drop policy if exists "chat_sessions_insert_team" on public.chat_sessions;
drop policy if exists "chat_sessions_update_team" on public.chat_sessions;
drop policy if exists "chat_sessions_delete_team" on public.chat_sessions;

create policy "chat_sessions_select_team" on public.chat_sessions
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "chat_sessions_insert_team" on public.chat_sessions
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "chat_sessions_update_team" on public.chat_sessions
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

create policy "chat_sessions_delete_team" on public.chat_sessions
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

drop policy if exists "chat_messages_select_team" on public.chat_messages;
drop policy if exists "chat_messages_insert_team" on public.chat_messages;
drop policy if exists "chat_messages_delete_team" on public.chat_messages;

create policy "chat_messages_select_team" on public.chat_messages
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "chat_messages_insert_team" on public.chat_messages
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "chat_messages_delete_team" on public.chat_messages
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

grant select, insert, update, delete on table public.chat_sessions to authenticated;
grant select, insert, delete on table public.chat_messages to authenticated;
