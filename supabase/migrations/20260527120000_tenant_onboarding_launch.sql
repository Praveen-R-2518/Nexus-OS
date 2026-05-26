-- Tenant onboarding: scope columns, private.current_team_id, invitations, launch_workspace RPC,
-- signup email status RPC, team-scoped RLS alignment, handle_new_user hardening.
-- Idempotent where possible. Safe to run after 0011_remove_demo_mode on projects that never applied 20260526044701.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) private.current_team_id()
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 1) Add missing tenant / workspace columns (no-op if already present)
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

alter table public.workspace_members
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

alter table public.subscriptions
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

alter table public.gmail_credentials
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

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

alter table public.reply_drafts
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

create index if not exists workspaces_team_id_idx on public.workspaces (team_id);
create index if not exists workspace_members_team_id_idx on public.workspace_members (team_id);
create index if not exists subscriptions_team_id_idx on public.subscriptions (team_id);
create index if not exists gmail_credentials_team_id_idx on public.gmail_credentials (team_id);
create index if not exists conversations_workspace_id_idx on public.conversations (workspace_id);
create index if not exists leads_workspace_id_idx on public.leads (workspace_id);
create index if not exists reply_drafts_workspace_id_idx on public.reply_drafts (workspace_id);
create index if not exists followups_workspace_id_idx on public.followups (workspace_id);
create index if not exists workflow_logs_workspace_id_idx on public.workflow_logs (workspace_id);
create index if not exists daily_reports_workspace_id_idx on public.daily_reports (workspace_id);
create index if not exists business_profiles_workspace_id_idx on public.business_profiles (workspace_id);

-- ---------------------------------------------------------------------------
-- 2) Workspace auto-team + member team sync (from 0006; ensure present)
-- ---------------------------------------------------------------------------
create or replace function public.trg_workspaces_before_insert_create_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_id is null then
    insert into public.teams (name)
    values (coalesce(nullif(trim(new.name), ''), 'Workspace'))
    returning id into new.team_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspaces_before_insert_create_team on public.workspaces;
create trigger trg_workspaces_before_insert_create_team
before insert on public.workspaces for each row
execute function public.trg_workspaces_before_insert_create_team();

create or replace function public.trg_workspace_members_set_team_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select w.team_id into new.team_id
  from public.workspaces w
  where w.id = new.workspace_id;

  if new.team_id is null then
    raise exception 'workspace % has no team_id', new.workspace_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_workspace_members_set_team_from_workspace on public.workspace_members;
create trigger trg_workspace_members_set_team_from_workspace
before insert
or update of workspace_id on public.workspace_members for each row
execute function public.trg_workspace_members_set_team_from_workspace();

create or replace function public.trg_workspace_members_after_sync_profile_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tid uuid;
begin
  select w.team_id into tid from public.workspaces w where w.id = new.workspace_id;

  update public.profiles
  set
    team_id = tid,
    updated_at = now()
  where
    id = new.user_id;

  return new;
end;
$$;

drop trigger if exists trg_workspace_members_after_sync_profile_team on public.workspace_members;
create trigger trg_workspace_members_after_sync_profile_team
after insert on public.workspace_members for each row
execute function public.trg_workspace_members_after_sync_profile_team();

-- ---------------------------------------------------------------------------
-- 3) Operational sync triggers
-- ---------------------------------------------------------------------------
create or replace function public.sync_workspace_and_team_from_conversation()
returns trigger
language plpgsql
set search_path = public
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

create or replace function public.sync_team_id_from_workspace()
returns trigger
language plpgsql
set search_path = public
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

drop trigger if exists trg_conversations_1_team_from_workspace on public.conversations;
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

create or replace function public.conversations_set_team_from_profile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  tid uuid;
begin
  if new.team_id is not null then
    return new;
  end if;

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

drop trigger if exists trg_conversations_2_set_team_from_profile on public.conversations;
create trigger trg_conversations_2_set_team_from_profile
before insert on public.conversations for each row
execute function public.conversations_set_team_from_profile();

-- ---------------------------------------------------------------------------
-- 4) Backfill team_id on workspaces / members / child tables (non-destructive)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  tid uuid;
begin
  for r in
  select id, name, created_at
  from public.workspaces
  where team_id is null
  loop
    insert into public.teams (name, created_at)
    values (coalesce(nullif(trim(r.name), ''), 'Workspace'), coalesce(r.created_at, now()))
    returning id into tid;

    update public.workspaces
    set team_id = tid
    where id = r.id;
  end loop;
end;
$$;

update public.workspace_members wm
set team_id = w.team_id
from public.workspaces w
where w.id = wm.workspace_id
  and wm.team_id is null
  and w.team_id is not null;

update public.subscriptions s
set team_id = w.team_id
from public.workspaces w
where w.id = s.workspace_id
  and s.team_id is null
  and w.team_id is not null;

update public.gmail_credentials g
set team_id = w.team_id
from public.workspaces w
where w.id = g.workspace_id
  and g.team_id is null
  and w.team_id is not null;

update public.profiles p
set team_id = x.team_id
from (
  select distinct on (wm.user_id)
    wm.user_id as uid,
    w.team_id
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where w.team_id is not null
  order by
    wm.user_id,
    case when wm.role = 'owner' then 0 else 1 end,
    wm.joined_at asc,
    wm.id asc
) x
where p.id = x.uid
  and p.team_id is null;

-- ---------------------------------------------------------------------------
-- 5) invitations
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists invitations_team_email_pending_uidx
  on public.invitations (team_id, lower(trim(email)))
  where status = 'pending';

create index if not exists invitations_team_id_idx on public.invitations (team_id);

alter table public.invitations enable row level security;

drop policy if exists "invitations_select_team" on public.invitations;
create policy "invitations_select_team" on public.invitations for
select to authenticated using (team_id = (select private.current_team_id()));

drop policy if exists "invitations_insert_team" on public.invitations;
create policy "invitations_insert_team" on public.invitations for insert to authenticated with check (
  team_id = (select private.current_team_id())
  and invited_by = (select auth.uid())
);

grant select, insert on public.invitations to authenticated;

-- ---------------------------------------------------------------------------
-- 6) handle_new_user (align with repo 0006; fixed search_path)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'phone', '')), '')
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- ---------------------------------------------------------------------------
-- 7) Signup email status (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.check_signup_email_status(email_input text)
returns text
language sql
stable
security definer
set search_path = auth, public
as $$
  select case
    when exists (
      select 1
      from auth.users u
      where lower(btrim(u.email::text)) = lower(btrim(email_input))
        and u.email_confirmed_at is not null
    ) then 'confirmed'
    when exists (
      select 1
      from auth.users u
      where lower(btrim(u.email::text)) = lower(btrim(email_input))
        and u.email_confirmed_at is null
    ) then 'pending_verification'
    else 'available'
  end;
$$;

comment on function public.check_signup_email_status(text) is
  'available | pending_verification | confirmed. service_role only.';

revoke all on function public.check_signup_email_status(text) from public;
grant execute on function public.check_signup_email_status(text) to service_role;

-- ---------------------------------------------------------------------------
-- 8) launch_workspace — atomic team + profile + workspace + owner + invites
-- ---------------------------------------------------------------------------
create or replace function public.launch_workspace(
  company_name text,
  invite_emails text[] default array[]::text[],
  workspace_type text default 'solo',
  industry text default 'Technology',
  company_size text default 'Just me'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_team_id uuid;
  v_workspace_id uuid;
  v_slug text;
  v_name text := trim(both from company_name);
  v_email text;
  v_wtype text := lower(trim(both from coalesce(workspace_type, 'solo')));
  v_ind text := trim(both from coalesce(industry, 'Technology'));
  v_size text := trim(both from coalesce(company_size, 'Just me'));
  v_self_email text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_name is null or length(v_name) < 1 then
    raise exception 'company_name required';
  end if;

  if v_wtype not in ('solo', 'team') then
    raise exception 'invalid workspace_type';
  end if;

  if exists (select 1 from public.profiles p where p.id = v_uid and p.team_id is not null) then
    raise exception 'Workspace already initialized';
  end if;

  select lower(trim(both from u.email::text)) into v_self_email from auth.users u where u.id = v_uid;

  insert into public.teams (name)
  values (v_name)
  returning id into v_team_id;

  update public.profiles
  set team_id = v_team_id, updated_at = now()
  where id = v_uid;

  v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug is null or v_slug = '' then
    v_slug := 'workspace';
  end if;
  v_slug := v_slug || '-' || floor(extract(epoch from now()) * 1000)::bigint;

  insert into public.workspaces (name, slug, workspace_type, industry, company_size, owner_user_id, team_id)
  values (v_name, v_slug, v_wtype, nullif(v_ind, ''), nullif(v_size, ''), v_uid, v_team_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_uid, 'owner');

  if invite_emails is not null then
    foreach v_email in array coalesce(invite_emails, array[]::text[])
    loop
      v_email := lower(trim(both from v_email));
      if v_email is null or v_email = '' or position('@' in v_email) = 0 then
        continue;
      end if;
      if v_self_email is not null and v_email = v_self_email then
        continue;
      end if;
      if exists (
        select 1 from public.invitations i
        where i.team_id = v_team_id
          and i.status = 'pending'
          and lower(trim(i.email)) = v_email
      ) then
        continue;
      end if;
      insert into public.invitations (team_id, email, invited_by, status)
      values (v_team_id, v_email, v_uid, 'pending');
    end loop;
  end if;

  return jsonb_build_object('team_id', v_team_id, 'workspace_id', v_workspace_id);
end;
$$;

revoke all on function public.launch_workspace(text, text[], text, text, text) from public;
grant execute on function public.launch_workspace(text, text[], text, text, text) to authenticated;

comment on function public.launch_workspace(text, text[], text, text, text) is
  'First-time workspace bootstrap: team, profile.team_id, workspace, owner member, optional invitations.';

-- ---------------------------------------------------------------------------
-- 9) RLS: drop legacy org + duplicate team policies; add team-scoped policies
-- ---------------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.leads enable row level security;
alter table public.reply_drafts enable row level security;
alter table public.followups enable row level security;
alter table public.workflow_logs enable row level security;
alter table public.daily_reports enable row level security;
alter table public.business_profiles enable row level security;

drop policy if exists "conversations_org_isolation" on public.conversations;
drop policy if exists "leads_org_isolation" on public.leads;
drop policy if exists "reply_drafts_org_isolation" on public.reply_drafts;
drop policy if exists "followups_org_isolation" on public.followups;
drop policy if exists "workflow_logs_org_isolation" on public.workflow_logs;
drop policy if exists "daily_reports_org_isolation" on public.daily_reports;

drop policy if exists "conversations_team_access" on public.conversations;
drop policy if exists "leads_team_access" on public.leads;
drop policy if exists "reply_drafts_team_access" on public.reply_drafts;
drop policy if exists "followups_team_access" on public.followups;
drop policy if exists "workflow_logs_team_access" on public.workflow_logs;
drop policy if exists "daily_reports_team_access" on public.daily_reports;
drop policy if exists "business_profiles_team_access" on public.business_profiles;

drop policy if exists "team_members_select_conversations" on public.conversations;
drop policy if exists "team_members_insert_conversations" on public.conversations;
drop policy if exists "team_members_update_conversations" on public.conversations;
drop policy if exists "team_members_delete_conversations" on public.conversations;

drop policy if exists "team_members_select_leads" on public.leads;
drop policy if exists "team_members_insert_leads" on public.leads;
drop policy if exists "team_members_update_leads" on public.leads;
drop policy if exists "team_members_delete_leads" on public.leads;

drop policy if exists "team_members_select_reply_drafts" on public.reply_drafts;
drop policy if exists "team_members_insert_reply_drafts" on public.reply_drafts;
drop policy if exists "team_members_update_reply_drafts" on public.reply_drafts;
drop policy if exists "team_members_delete_reply_drafts" on public.reply_drafts;

drop policy if exists "team_members_select_followups" on public.followups;
drop policy if exists "team_members_insert_followups" on public.followups;
drop policy if exists "team_members_update_followups" on public.followups;
drop policy if exists "team_members_delete_followups" on public.followups;

drop policy if exists "team_members_select_workflow_logs" on public.workflow_logs;
drop policy if exists "team_members_insert_workflow_logs" on public.workflow_logs;
drop policy if exists "team_members_update_workflow_logs" on public.workflow_logs;
drop policy if exists "team_members_delete_workflow_logs" on public.workflow_logs;

drop policy if exists "team_members_select_daily_reports" on public.daily_reports;
drop policy if exists "team_members_insert_daily_reports" on public.daily_reports;
drop policy if exists "team_members_update_daily_reports" on public.daily_reports;
drop policy if exists "team_members_delete_daily_reports" on public.daily_reports;

drop policy if exists "team_members_select_business_profiles" on public.business_profiles;
drop policy if exists "team_members_insert_business_profiles" on public.business_profiles;
drop policy if exists "team_members_update_business_profiles" on public.business_profiles;
drop policy if exists "team_members_delete_business_profiles" on public.business_profiles;

create policy "team_members_select_conversations" on public.conversations for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_conversations" on public.conversations for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_conversations" on public.conversations for
update to authenticated using (team_id = (select private.current_team_id()))
with check (team_id = (select private.current_team_id()));

create policy "team_members_delete_conversations" on public.conversations for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_leads" on public.leads for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_leads" on public.leads for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_leads" on public.leads for
update to authenticated using (team_id = (select private.current_team_id()))
with check (team_id = (select private.current_team_id()));

create policy "team_members_delete_leads" on public.leads for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_reply_drafts" on public.reply_drafts for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_reply_drafts" on public.reply_drafts for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_reply_drafts" on public.reply_drafts for
update to authenticated using (team_id = (select private.current_team_id()))
with check (team_id = (select private.current_team_id()));

create policy "team_members_delete_reply_drafts" on public.reply_drafts for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_followups" on public.followups for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_followups" on public.followups for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_followups" on public.followups for
update to authenticated using (team_id = (select private.current_team_id()))
with check (team_id = (select private.current_team_id()));

create policy "team_members_delete_followups" on public.followups for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_workflow_logs" on public.workflow_logs for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_workflow_logs" on public.workflow_logs for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_workflow_logs" on public.workflow_logs for
update to authenticated using (team_id = (select private.current_team_id()))
with check (team_id = (select private.current_team_id()));

create policy "team_members_delete_workflow_logs" on public.workflow_logs for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_daily_reports" on public.daily_reports for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_daily_reports" on public.daily_reports for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_daily_reports" on public.daily_reports for
update to authenticated using (team_id = (select private.current_team_id()))
with check (team_id = (select private.current_team_id()));

create policy "team_members_delete_daily_reports" on public.daily_reports for delete to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_select_business_profiles" on public.business_profiles for
select to authenticated using (team_id = (select private.current_team_id()));

create policy "team_members_insert_business_profiles" on public.business_profiles for insert to authenticated with check (team_id = (select private.current_team_id()));

create policy "team_members_update_business_profiles" on public.business_profiles for
update to authenticated using (team_id = (select private.current_team_id()))
with check (team_id = (select private.current_team_id()));

create policy "team_members_delete_business_profiles" on public.business_profiles for delete to authenticated using (team_id = (select private.current_team_id()));

-- teams + profiles (replace legacy teams_access / single self policies)
drop policy if exists "teams_access" on public.teams;
drop policy if exists "teams deny authenticated select" on public.teams;
drop policy if exists "team_members_select_own_team" on public.teams;

create policy "team_members_select_own_team" on public.teams for
select to authenticated using (id = (select private.current_team_id()));

drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users manage own profile" on public.profiles;
drop policy if exists "profiles_select_self_or_teammates" on public.profiles;
drop policy if exists "profiles_insert_self" on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
drop policy if exists "profiles_delete_self" on public.profiles;

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
with check (id = (select auth.uid()));

create policy "profiles_delete_self" on public.profiles for delete to authenticated using (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 10) is_workspace_* helpers: lock down execution (trigger-only usage via RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_workspace_owner(uuid) from public;
revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) Grants on operational tables (idempotent)
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert, update, delete on table public.leads to authenticated;
grant select, insert, update, delete on table public.reply_drafts to authenticated;
grant select, insert, update, delete on table public.followups to authenticated;
grant select, insert, update, delete on table public.workflow_logs to authenticated;
grant select, insert, update, delete on table public.daily_reports to authenticated;
grant select, insert, update, delete on table public.business_profiles to authenticated;
