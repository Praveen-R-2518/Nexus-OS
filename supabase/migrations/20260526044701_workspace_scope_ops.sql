-- Workspace + team scoped operational data.
-- Tenant isolation for the dashboard uses private.current_team_id() (profiles.team_id).
-- n8n/internal routes use the Supabase service role (bypasses RLS).

-- 0) Private helper: session team from profiles (not JWT user_metadata) ----------
create schema if not exists private;

create or replace function private.current_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.team_id
  from public.profiles p
  where p.id = (select auth.uid());
$$;

comment on function private.current_team_id() is
  'Returns profiles.team_id for the current auth user; SECURITY DEFINER; do not use JWT claims for tenant.';

revoke all on function private.current_team_id() from public;

grant execute on function private.current_team_id() to authenticated;

revoke all on schema private from public;

grant usage on schema private to authenticated;

-- 1) workspace_id columns (compatibility with existing app / n8n payloads) -------
alter table public.conversations
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.leads
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.reply_drafts
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.followups
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.workflow_logs
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.daily_reports
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.business_profiles
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

-- Optional reply draft audit columns (API uses these)
alter table public.reply_drafts
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

create index if not exists conversations_workspace_id_idx on public.conversations (workspace_id);

create index if not exists leads_workspace_id_idx on public.leads (workspace_id);

create index if not exists reply_drafts_workspace_id_idx on public.reply_drafts (workspace_id);

create index if not exists followups_workspace_id_idx on public.followups (workspace_id);

create index if not exists workflow_logs_workspace_id_idx on public.workflow_logs (workspace_id);

create index if not exists daily_reports_workspace_id_idx on public.daily_reports (workspace_id);

create index if not exists business_profiles_workspace_id_idx on public.business_profiles (workspace_id);

-- 2) Sync workspace_id + team_id from parent conversation -----------------------
create or replace function public.sync_workspace_and_team_from_conversation()
returns trigger
language plpgsql
as $$
declare
  wid uuid;
  tid uuid;
begin
  if new.conversation_id is not null then
    select c.workspace_id, c.team_id into wid, tid
    from public.conversations c
    where c.id = new.conversation_id;

    if wid is not null then
      new.workspace_id := wid;
    end if;

    if tid is not null then
      new.team_id := tid;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leads_workspace_from_conversation on public.leads;

create trigger trg_leads_workspace_from_conversation
before insert or update of conversation_id on public.leads for each row
execute function public.sync_workspace_and_team_from_conversation();

drop trigger if exists trg_reply_drafts_workspace_from_conversation on public.reply_drafts;

create trigger trg_reply_drafts_workspace_from_conversation
before insert or update of conversation_id on public.reply_drafts for each row
execute function public.sync_workspace_and_team_from_conversation();

drop trigger if exists trg_followups_workspace_from_conversation on public.followups;

create trigger trg_followups_workspace_from_conversation
before insert or update of conversation_id on public.followups for each row
execute function public.sync_workspace_and_team_from_conversation();

-- 3) When workspace_id is set on a row, inherit team_id from the workspace -------
create or replace function public.sync_team_id_from_workspace()
returns trigger
language plpgsql
as $$
declare
  tid uuid;
begin
  if new.workspace_id is not null then
    select w.team_id into tid from public.workspaces w where w.id = new.workspace_id;

    if tid is null then
      raise exception 'workspace % has no team_id', new.workspace_id;
    end if;

    new.team_id := tid;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_conversations_team_from_workspace on public.conversations;

drop trigger if exists trg_conversations_1_team_from_workspace on public.conversations;

-- Runs before profile fallback so n8n inserts with workspace_id get team_id from workspace.
create trigger trg_conversations_1_team_from_workspace
before insert or update of workspace_id on public.conversations for each row
execute function public.sync_team_id_from_workspace();

drop trigger if exists trg_workflow_logs_team_from_workspace on public.workflow_logs;

create trigger trg_workflow_logs_team_from_workspace
before insert or update of workspace_id on public.workflow_logs for each row
execute function public.sync_team_id_from_workspace();

drop trigger if exists trg_daily_reports_team_from_workspace on public.daily_reports;

create trigger trg_daily_reports_team_from_workspace
before insert or update of workspace_id on public.daily_reports for each row
execute function public.sync_team_id_from_workspace();

drop trigger if exists trg_business_profiles_team_from_workspace on public.business_profiles;

create trigger trg_business_profiles_team_from_workspace
before insert or update of workspace_id on public.business_profiles for each row
execute function public.sync_team_id_from_workspace();

-- 4) Conversations without workspace_id: bind team from the caller profile -------
create or replace function public.conversations_set_team_from_profile()
returns trigger
language plpgsql
as $$
declare
  tid uuid;
begin
  if new.team_id is not null then
    return new;
  end if;

  -- workspace_id path: trg_conversations_1_team_from_workspace fills team_id before this trigger runs.
  if new.workspace_id is not null then
    return new;
  end if;

  select p.team_id into tid from public.profiles p where p.id = (select auth.uid());

  if tid is null then
    raise exception 'Cannot create conversation: profile has no team_id (complete workspace onboarding)';
  end if;

  new.team_id := tid;
  return new;
end;
$$;

drop trigger if exists trg_conversations_set_team_from_profile on public.conversations;

drop trigger if exists trg_conversations_2_set_team_from_profile on public.conversations;

create trigger trg_conversations_2_set_team_from_profile
before insert on public.conversations for each row
execute function public.conversations_set_team_from_profile();

-- 5) Backfill: one team per workspace (no arbitrary "first workspace" fallbacks) -
do $$
declare
  r record;
  tid uuid;
begin
  for r in
  select
    id,
    name,
    created_at
  from
    public.workspaces
  where
    team_id is null
    loop
      insert into public.teams(name, created_at)
        values (coalesce(nullif(trim(r.name), ''), 'Workspace'), coalesce(r.created_at, now()))
      returning
        id into tid;

      update public.workspaces
      set
        team_id = tid
      where
        id = r.id;
    end loop;
end;
$$;

update public.workspace_members wm
set
  team_id = w.team_id
from
  public.workspaces w
where
  w.id = wm.workspace_id
  and wm.team_id is null
  and w.team_id is not null;

update public.subscriptions s
set
  team_id = w.team_id
from
  public.workspaces w
where
  w.id = s.workspace_id
  and s.team_id is null
  and w.team_id is not null;

update public.gmail_credentials g
set
  team_id = w.team_id
from
  public.workspaces w
where
  w.id = g.workspace_id
  and g.team_id is null
  and w.team_id is not null;

-- Profiles: pick a deterministic workspace membership (owner first, then oldest).
update public.profiles p
set
  team_id = x.team_id
from (
  select distinct on (wm.user_id)
    wm.user_id as uid,
    w.team_id
  from
    public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
  where
    w.team_id is not null
  order by
    wm.user_id,
    case when wm.role = 'owner' then 0 else 1 end,
    wm.joined_at asc,
    wm.id asc
) x
where
  p.id = x.uid
  and p.team_id is null;

-- Operational rows: team from workspace when workspace_id is present
update public.conversations c
set
  team_id = w.team_id
from
  public.workspaces w
where
  c.workspace_id = w.id
  and c.team_id is null
  and w.team_id is not null;

update public.leads l
set
  team_id = c.team_id
from
  public.conversations c
where
  c.id = l.conversation_id
  and l.team_id is null
  and c.team_id is not null;

update public.reply_drafts rd
set
  team_id = c.team_id
from
  public.conversations c
where
  c.id = rd.conversation_id
  and rd.team_id is null
  and c.team_id is not null;

update public.followups f
set
  team_id = c.team_id
from
  public.conversations c
where
  c.id = f.conversation_id
  and f.team_id is null
  and c.team_id is not null;

update public.leads l
set
  team_id = w.team_id
from
  public.workspaces w
where
  l.workspace_id = w.id
  and l.team_id is null
  and w.team_id is not null;

update public.reply_drafts rd
set
  team_id = w.team_id
from
  public.workspaces w
where
  rd.workspace_id = w.id
  and rd.team_id is null
  and w.team_id is not null;

update public.followups f
set
  team_id = w.team_id
from
  public.workspaces w
where
  f.workspace_id = w.id
  and f.team_id is null
  and w.team_id is not null;

update public.workflow_logs wl
set
  team_id = w.team_id
from
  public.workspaces w
where
  wl.workspace_id = w.id
  and wl.team_id is null
  and w.team_id is not null;

update public.daily_reports dr
set
  team_id = w.team_id
from
  public.workspaces w
where
  dr.workspace_id = w.id
  and dr.team_id is null
  and w.team_id is not null;

update public.business_profiles bp
set
  team_id = w.team_id
from
  public.workspaces w
where
  bp.workspace_id = w.id
  and bp.team_id is null
  and w.team_id is not null;

-- 6) Remove orphan rows that cannot be attributed to a tenant -------------------
delete from public.reply_drafts
where team_id is null;

delete from public.followups
where team_id is null;

delete from public.leads
where team_id is null;

delete from public.conversations
where team_id is null;

delete from public.workflow_logs
where team_id is null;

delete from public.daily_reports
where team_id is null;

delete from public.business_profiles
where team_id is null;

-- 7) Hard fail if any workspace is still unteamed (data integrity) --------------
do $$
begin
  if exists (
    select
      1
    from
      public.workspaces
    where
      team_id is null
  ) then
    raise exception 'Migration halted: workspaces exist without team_id';
  end if;
end;
$$;

-- 8) Dedupe business_profiles / daily_reports per tenant -------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by team_id
      order by
        created_at asc nulls last,
        id asc
    ) as rn
  from
    public.business_profiles
  where
    team_id is not null
)
delete from public.business_profiles bp using ranked r
where bp.id = r.id
  and r.rn > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by team_id,
      coalesce(report_date, current_date)
      order by
        created_at desc nulls last,
        id desc
    ) as rn
  from
    public.daily_reports
  where
    team_id is not null
)
delete from public.daily_reports d using ranked r
where d.id = r.id
  and r.rn > 1;

alter table public.daily_reports drop constraint if exists daily_reports_report_date_key;

alter table public.daily_reports drop constraint if exists daily_reports_workspace_report_date_key;

do $$
begin
  if not exists (
    select
      1
    from
      pg_constraint
    where
      conrelid = 'public.daily_reports'::regclass
      and conname = 'daily_reports_team_report_date_key'
  ) then
    alter table public.daily_reports
      add constraint daily_reports_team_report_date_key unique (team_id, report_date);
  end if;
end;
$$;

drop index if exists business_profiles_one_per_workspace_uidx;

create unique index if not exists business_profiles_one_per_team_uidx on public.business_profiles (team_id)
where
  team_id is not null;

-- 9) Enforce NOT NULL team_id ---------------------------------------------------
alter table public.conversations
  alter column team_id set not null;

alter table public.leads
  alter column team_id set not null;

alter table public.reply_drafts
  alter column team_id set not null;

alter table public.followups
  alter column team_id set not null;

alter table public.workflow_logs
  alter column team_id set not null;

alter table public.daily_reports
  alter column team_id set not null;

alter table public.business_profiles
  alter column team_id set not null;

alter table public.workspaces
  alter column team_id set not null;

alter table public.workspace_members
  alter column team_id set not null;

-- subscriptions / gmail may exist without workspace in edge cases; require team if row exists
update public.subscriptions s
set
  team_id = w.team_id
from
  public.workspaces w
where
  s.workspace_id = w.id
  and s.team_id is null;

update public.gmail_credentials g
set
  team_id = w.team_id
from
  public.workspaces w
where
  g.workspace_id = w.id
  and g.team_id is null;

delete from public.subscriptions
where team_id is null;

delete from public.gmail_credentials
where team_id is null;

alter table public.subscriptions
  alter column team_id set not null;

alter table public.gmail_credentials
  alter column team_id set not null;

-- 10) Tenant-scoped indexes ------------------------------------------------------
create index if not exists conversations_team_created_at_idx on public.conversations (team_id, created_at desc);

create index if not exists conversations_team_status_updated_idx on public.conversations (team_id, status, updated_at desc);

create index if not exists leads_team_status_updated_idx on public.leads (team_id, status, updated_at desc);

create index if not exists reply_drafts_team_approval_created_idx on public.reply_drafts (team_id, approval_status, created_at desc);

create index if not exists followups_team_status_scheduled_idx on public.followups (team_id, status, scheduled_for);

create index if not exists workflow_logs_team_timestamp_idx on public.workflow_logs (team_id, timestamp desc);

create index if not exists daily_reports_team_report_date_idx on public.daily_reports (team_id, report_date desc);

-- 11) Drop legacy / demo policies on operational tables -------------------------
drop policy if exists "demo anon can read business profiles" on public.business_profiles;

drop policy if exists "demo anon can read conversations" on public.conversations;

drop policy if exists "demo anon can insert conversations" on public.conversations;

drop policy if exists "demo anon can update conversations" on public.conversations;

drop policy if exists "demo anon can read leads" on public.leads;

drop policy if exists "demo anon can insert leads" on public.leads;

drop policy if exists "demo anon can update leads" on public.leads;

drop policy if exists "demo anon can read reply drafts" on public.reply_drafts;

drop policy if exists "demo anon can insert reply drafts" on public.reply_drafts;

drop policy if exists "demo anon can update reply drafts" on public.reply_drafts;

drop policy if exists "demo anon can read followups" on public.followups;

drop policy if exists "demo anon can insert followups" on public.followups;

drop policy if exists "demo anon can update followups" on public.followups;

drop policy if exists "demo anon can read workflow logs" on public.workflow_logs;

drop policy if exists "demo anon can insert workflow logs" on public.workflow_logs;

drop policy if exists "demo anon can read daily reports" on public.daily_reports;

drop policy if exists "demo anon can insert daily reports" on public.daily_reports;

drop policy if exists "demo anon can update daily reports" on public.daily_reports;

drop policy if exists "allow_all_business_profiles" on public.business_profiles;

drop policy if exists "allow_all_conversations" on public.conversations;

drop policy if exists "allow_all_leads" on public.leads;

drop policy if exists "allow_all_reply_drafts" on public.reply_drafts;

drop policy if exists "allow_all_followups" on public.followups;

drop policy if exists "allow_all_workflow_logs" on public.workflow_logs;

drop policy if exists "allow_all_daily_reports" on public.daily_reports;

drop policy if exists "workspace_members_read_conversations" on public.conversations;

drop policy if exists "workspace_members_insert_conversations" on public.conversations;

drop policy if exists "workspace_members_update_conversations" on public.conversations;

drop policy if exists "workspace_members_delete_conversations" on public.conversations;

drop policy if exists "workspace_members_read_leads" on public.leads;

drop policy if exists "workspace_members_insert_leads" on public.leads;

drop policy if exists "workspace_members_update_leads" on public.leads;

drop policy if exists "workspace_members_delete_leads" on public.leads;

drop policy if exists "workspace_members_read_reply_drafts" on public.reply_drafts;

drop policy if exists "workspace_members_insert_reply_drafts" on public.reply_drafts;

drop policy if exists "workspace_members_update_reply_drafts" on public.reply_drafts;

drop policy if exists "workspace_members_delete_reply_drafts" on public.reply_drafts;

drop policy if exists "workspace_members_read_followups" on public.followups;

drop policy if exists "workspace_members_insert_followups" on public.followups;

drop policy if exists "workspace_members_update_followups" on public.followups;

drop policy if exists "workspace_members_delete_followups" on public.followups;

drop policy if exists "workspace_members_read_workflow_logs" on public.workflow_logs;

drop policy if exists "workspace_members_insert_workflow_logs" on public.workflow_logs;

drop policy if exists "workspace_members_read_daily_reports" on public.daily_reports;

drop policy if exists "workspace_members_read_business_profiles" on public.business_profiles;

drop policy if exists "workspace_members_insert_business_profiles" on public.business_profiles;

drop policy if exists "workspace_members_update_business_profiles" on public.business_profiles;

drop policy if exists "workspace_members_delete_business_profiles" on public.business_profiles;

-- 12) Team-scoped RLS on operational tables -------------------------------------
create policy "team_members_select_conversations" on public.conversations for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_conversations" on public.conversations for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_conversations" on public.conversations for
update to authenticated using (team_id = (select private.current_team_id()))
with
  check (team_id = (select private.current_team_id()));

create policy "team_members_delete_conversations" on public.conversations for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_leads" on public.leads for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_leads" on public.leads for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_leads" on public.leads for
update to authenticated using (team_id = (select private.current_team_id()))
with
  check (team_id = (select private.current_team_id()));

create policy "team_members_delete_leads" on public.leads for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_reply_drafts" on public.reply_drafts for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_reply_drafts" on public.reply_drafts for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_reply_drafts" on public.reply_drafts for
update to authenticated using (team_id = (select private.current_team_id()))
with
  check (team_id = (select private.current_team_id()));

create policy "team_members_delete_reply_drafts" on public.reply_drafts for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_followups" on public.followups for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_followups" on public.followups for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_followups" on public.followups for
update to authenticated using (team_id = (select private.current_team_id()))
with
  check (team_id = (select private.current_team_id()));

create policy "team_members_delete_followups" on public.followups for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_workflow_logs" on public.workflow_logs for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_workflow_logs" on public.workflow_logs for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_workflow_logs" on public.workflow_logs for
update to authenticated using (team_id = (select private.current_team_id()))
with
  check (team_id = (select private.current_team_id()));

create policy "team_members_delete_workflow_logs" on public.workflow_logs for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_daily_reports" on public.daily_reports for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_daily_reports" on public.daily_reports for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_daily_reports" on public.daily_reports for
update to authenticated using (team_id = (select private.current_team_id()))
with
  check (team_id = (select private.current_team_id()));

create policy "team_members_delete_daily_reports" on public.daily_reports for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_business_profiles" on public.business_profiles for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_business_profiles" on public.business_profiles for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_business_profiles" on public.business_profiles for
update to authenticated using (team_id = (select private.current_team_id()))
with
  check (team_id = (select private.current_team_id()));

create policy "team_members_delete_business_profiles" on public.business_profiles for delete to authenticated using (team_id = (select private.current_team_id()));

-- 13) teams + profiles policies (replace bootstrap deny-all on teams) -----------
drop policy if exists "teams deny authenticated select" on public.teams;

create policy "team_members_select_own_team" on public.teams for
select to authenticated using (id = (select private.current_team_id()));

drop policy if exists "Users manage own profile" on public.profiles;

create policy "profiles_select_self_or_teammates" on public.profiles for
select to authenticated using (
  id = (select auth.uid())
  or (
    team_id is not null
    and team_id = (select private.current_team_id())
    and (select private.current_team_id()) is not null
  )
);

create policy "profiles_insert_self" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

create policy "profiles_update_self" on public.profiles for
update to authenticated using (id = (select auth.uid()))
with
  check (id = (select auth.uid()));

create policy "profiles_delete_self" on public.profiles for delete to authenticated using (id = (select auth.uid()));

-- 14) Grants: authenticated CRUD on ops (tenant-filtered by RLS) -----------------
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
insert,
update,
delete on table public.workflow_logs to authenticated;

grant
select,
insert,
update,
delete on table public.daily_reports to authenticated;

grant
select,
insert,
update,
delete on table public.business_profiles to authenticated;
