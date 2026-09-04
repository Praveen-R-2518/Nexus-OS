-- Wave 1 F2 — People outbound email drafts (generate → persist → explicit send).
-- Tenant root is teams/workspaces. Send uses stored subject/body. No People-row mutation on send.

create table if not exists public.people_message_drafts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  recipient_type text not null
    check (recipient_type in ('employee', 'candidate')),
  employee_id uuid references public.employees (id) on delete restrict,
  candidate_id uuid references public.candidates (id) on delete restrict,
  recipient_name text,
  recipient_email text not null,
  purpose text,
  tone text,
  situation text,
  facts jsonb not null default '[]'::jsonb,
  related_date date,
  subject text not null,
  body text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'discarded')),
  sent_at timestamptz,
  provider_message_id text,
  transport text
    check (transport is null or transport in ('gmail', 'smtp', 'sandbox')),
  ai_model text,
  ai_prompt_version text,
  ai_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_message_drafts_recipient_chk check (
    (
      recipient_type = 'employee'
      and employee_id is not null
      and candidate_id is null
    )
    or (
      recipient_type = 'candidate'
      and candidate_id is not null
      and employee_id is null
    )
  )
);

comment on table public.people_message_drafts is
  'People composer drafts. Generate persists status=draft; explicit send marks sent. Failed send does not mutate employees/candidates.';

create index if not exists people_message_drafts_team_created_idx
  on public.people_message_drafts (team_id, created_at desc);

create index if not exists people_message_drafts_team_status_idx
  on public.people_message_drafts (team_id, status);

drop trigger if exists trg_people_message_drafts_set_team_from_workspace
  on public.people_message_drafts;
create trigger trg_people_message_drafts_set_team_from_workspace
  before insert or update of workspace_id on public.people_message_drafts
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_people_message_drafts_updated_at
  on public.people_message_drafts;
create trigger trg_people_message_drafts_updated_at
  before update on public.people_message_drafts
  for each row
  execute function public.handle_chat_sessions_updated_at();

alter table public.people_message_drafts enable row level security;

drop policy if exists "people_message_drafts_select_team" on public.people_message_drafts;
drop policy if exists "people_message_drafts_insert_team" on public.people_message_drafts;
drop policy if exists "people_message_drafts_update_team" on public.people_message_drafts;
drop policy if exists "people_message_drafts_delete_team" on public.people_message_drafts;

create policy "people_message_drafts_select_team" on public.people_message_drafts
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "people_message_drafts_insert_team" on public.people_message_drafts
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "people_message_drafts_update_team" on public.people_message_drafts
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

create policy "people_message_drafts_delete_team" on public.people_message_drafts
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

revoke all on table public.people_message_drafts from anon;
grant select, insert, update, delete on table public.people_message_drafts to authenticated;
