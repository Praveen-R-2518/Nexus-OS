-- Signup/backend repair: live projects may be behind the repo onboarding schema.
-- Idempotent drift repair for verified-email signup, tenant binding, workspace scope,
-- and first workspace launch.

create extension if not exists pgcrypto;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1) Required columns and indexes
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
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.followups
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.workflow_logs
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.daily_reports
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.business_profiles
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.invitations
  add column if not exists status text not null default 'pending',
  add column if not exists accepted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invitations_status_check'
      and conrelid = 'public.invitations'::regclass
  ) then
    alter table public.invitations
      add constraint invitations_status_check
      check (status in ('pending', 'accepted', 'revoked'));
  end if;
end;
$$;

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

create unique index if not exists invitations_team_email_pending_uidx
  on public.invitations (team_id, lower(trim(email)))
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 2) Tenant helpers
-- ---------------------------------------------------------------------------
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

revoke all on function private.current_team_id() from public;
grant execute on function private.current_team_id() to authenticated;
revoke all on schema private from public;
grant usage on schema private to authenticated;

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
-- 3) Backfill team/workspace bindings for older deployed databases
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  tid uuid;
  has_team_owner boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teams'
      and column_name = 'owner_id'
  ) into has_team_owner;

  for r in
    select
      w.id,
      w.name,
      w.created_at,
      w.owner_user_id,
      p.team_id as profile_team_id
    from public.workspaces w
    left join public.profiles p on p.id = w.owner_user_id
    where w.team_id is null
    order by w.created_at asc, w.id asc
  loop
    tid := r.profile_team_id;

    if tid is null then
      if has_team_owner then
        execute
          'insert into public.teams (name, owner_id, created_at) values ($1, $2, coalesce($3, now())) returning id'
          into tid
          using coalesce(nullif(trim(r.name), ''), 'Workspace'), r.owner_user_id, r.created_at;
      else
        insert into public.teams (name, created_at)
        values (coalesce(nullif(trim(r.name), ''), 'Workspace'), coalesce(r.created_at, now()))
        returning id into tid;
      end if;
    end if;

    update public.workspaces
    set team_id = tid
    where id = r.id;

    if r.owner_user_id is not null then
      insert into public.profiles (id, team_id, updated_at)
      values (r.owner_user_id, tid, now())
      on conflict (id) do update set
        team_id = coalesce(public.profiles.team_id, excluded.team_id),
        updated_at = now();
    end if;
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
set team_id = x.team_id, updated_at = now()
from (
  select distinct on (wm.user_id)
    wm.user_id,
    wm.team_id
  from public.workspace_members wm
  where wm.team_id is not null
  order by wm.user_id, case when wm.role = 'owner' then 0 else 1 end, wm.joined_at asc, wm.id asc
) x
where p.id = x.user_id
  and p.team_id is null;

update public.conversations c
set workspace_id = w.id
from public.workspaces w
where c.workspace_id is null
  and c.team_id = w.team_id;

update public.leads l
set workspace_id = c.workspace_id, team_id = coalesce(l.team_id, c.team_id)
from public.conversations c
where l.workspace_id is null
  and l.conversation_id = c.id
  and c.workspace_id is not null;

update public.reply_drafts rd
set workspace_id = c.workspace_id, team_id = coalesce(rd.team_id, c.team_id)
from public.conversations c
where rd.workspace_id is null
  and rd.conversation_id = c.id
  and c.workspace_id is not null;

update public.followups f
set workspace_id = c.workspace_id, team_id = coalesce(f.team_id, c.team_id)
from public.conversations c
where f.workspace_id is null
  and f.conversation_id = c.id
  and c.workspace_id is not null;

update public.workflow_logs wl
set workspace_id = w.id
from public.workspaces w
where wl.workspace_id is null
  and wl.team_id = w.team_id;

update public.daily_reports dr
set workspace_id = w.id
from public.workspaces w
where dr.workspace_id is null
  and dr.team_id = w.team_id;

update public.business_profiles bp
set workspace_id = w.id
from public.workspaces w
where bp.workspace_id is null
  and bp.team_id = w.team_id;

-- ---------------------------------------------------------------------------
-- 4) Sync triggers
-- ---------------------------------------------------------------------------
create or replace function public.trg_workspaces_before_insert_create_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_team_owner boolean;
begin
  if new.team_id is null then
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'teams'
        and column_name = 'owner_id'
    ) into has_team_owner;

    if has_team_owner then
      execute
        'insert into public.teams (name, owner_id) values ($1, $2) returning id'
        into new.team_id
        using coalesce(nullif(trim(new.name), ''), 'Workspace'), new.owner_user_id;
    else
      insert into public.teams (name)
      values (coalesce(nullif(trim(new.name), ''), 'Workspace'))
      returning id into new.team_id;
    end if;
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
before insert or update of workspace_id on public.workspace_members for each row
execute function public.trg_workspace_members_set_team_from_workspace();

create or replace function public.trg_workspace_members_after_sync_profile_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set team_id = new.team_id, updated_at = now()
  where id = new.user_id
    and (team_id is null or team_id = new.team_id);

  return new;
end;
$$;

drop trigger if exists trg_workspace_members_after_sync_profile_team on public.workspace_members;
create trigger trg_workspace_members_after_sync_profile_team
after insert on public.workspace_members for each row
execute function public.trg_workspace_members_after_sync_profile_team();

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

-- ---------------------------------------------------------------------------
-- 5) Auth profile trigger and signup RPCs
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users for each row
execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

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

revoke all on function public.check_signup_email_status(text) from public;
revoke all on function public.check_signup_email_status(text) from anon;
revoke all on function public.check_signup_email_status(text) from authenticated;
grant execute on function public.check_signup_email_status(text) to service_role;

-- ---------------------------------------------------------------------------
-- 6) First workspace launch
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
  v_existing_team_id uuid;
  v_workspace_id uuid;
  v_slug text;
  v_name text := trim(both from company_name);
  v_email text;
  v_wtype text := lower(trim(both from coalesce(workspace_type, 'solo')));
  v_ind text := trim(both from coalesce(industry, 'Technology'));
  v_size text := trim(both from coalesce(company_size, 'Just me'));
  v_self_email text;
  has_team_owner boolean;
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

  select lower(trim(both from u.email::text)) into v_self_email
  from auth.users u
  where u.id = v_uid;

  insert into public.profiles (id, updated_at)
  values (v_uid, now())
  on conflict (id) do nothing;

  select p.team_id into v_existing_team_id
  from public.profiles p
  where p.id = v_uid;

  if v_existing_team_id is not null then
    raise exception 'Workspace already initialized';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teams'
      and column_name = 'owner_id'
  ) into has_team_owner;

  if has_team_owner then
    execute
      'insert into public.teams (name, owner_id) values ($1, $2) returning id'
      into v_team_id
      using v_name, v_uid;
  else
    insert into public.teams (name)
    values (v_name)
    returning id into v_team_id;
  end if;

  update public.profiles
  set team_id = v_team_id, updated_at = now()
  where id = v_uid
    and team_id is null;

  if not found then
    raise exception 'Could not bind profile to workspace';
  end if;

  v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug is null or v_slug = '' then
    v_slug := 'workspace';
  end if;
  v_slug := v_slug || '-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint;

  insert into public.workspaces (name, slug, workspace_type, industry, company_size, owner_user_id, team_id)
  values (v_name, v_slug, v_wtype, nullif(v_ind, ''), nullif(v_size, ''), v_uid, v_team_id)
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_uid, 'owner')
  on conflict (workspace_id, user_id) do nothing;

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
      insert into public.invitations (team_id, email, invited_by, status)
      values (v_team_id, v_email, v_uid, 'pending')
      on conflict do nothing;
    end loop;
  end if;

  return jsonb_build_object('team_id', v_team_id, 'workspace_id', v_workspace_id);
end;
$$;

revoke all on function public.launch_workspace(text, text[], text, text, text) from public;
revoke all on function public.launch_workspace(text, text[], text, text, text) from anon;
grant execute on function public.launch_workspace(text, text[], text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) RLS policies and grants
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.subscriptions enable row level security;
alter table public.gmail_credentials enable row level security;
alter table public.invitations enable row level security;
alter table public.conversations enable row level security;
alter table public.leads enable row level security;
alter table public.reply_drafts enable row level security;
alter table public.followups enable row level security;
alter table public.workflow_logs enable row level security;
alter table public.daily_reports enable row level security;
alter table public.business_profiles enable row level security;

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

drop policy if exists "Owners manage workspace" on public.workspaces;
drop policy if exists "Members view workspace" on public.workspaces;
drop policy if exists "workspaces_select_team" on public.workspaces;
drop policy if exists "workspaces_insert_owner" on public.workspaces;
drop policy if exists "workspaces_update_owner" on public.workspaces;
create policy "workspaces_select_team" on public.workspaces for
select to authenticated using (team_id = (select private.current_team_id()) or owner_user_id = (select auth.uid()));
create policy "workspaces_insert_owner" on public.workspaces for insert to authenticated with check (owner_user_id = (select auth.uid()));
create policy "workspaces_update_owner" on public.workspaces for
update to authenticated using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

drop policy if exists "Workspace members visible to members" on public.workspace_members;
drop policy if exists "Owners insert workspace members" on public.workspace_members;
drop policy if exists "workspace_members_select_team" on public.workspace_members;
drop policy if exists "workspace_members_insert_owner" on public.workspace_members;
create policy "workspace_members_select_team" on public.workspace_members for
select to authenticated using (team_id = (select private.current_team_id()) or user_id = (select auth.uid()));
create policy "workspace_members_insert_owner" on public.workspace_members for insert to authenticated with check (public.is_workspace_owner(workspace_id));

drop policy if exists "invitations_select_team" on public.invitations;
drop policy if exists "invitations_insert_team" on public.invitations;
create policy "invitations_select_team" on public.invitations for
select to authenticated using (team_id = (select private.current_team_id()));
create policy "invitations_insert_team" on public.invitations for insert to authenticated with check (
  team_id = (select private.current_team_id())
  and invited_by = (select auth.uid())
);

drop policy if exists "Owner views subscription" on public.subscriptions;
drop policy if exists "Team members read subscriptions" on public.subscriptions;
drop policy if exists "subscriptions_select_team" on public.subscriptions;
create policy "subscriptions_select_team" on public.subscriptions for
select to authenticated using (team_id = (select private.current_team_id()) or public.is_workspace_owner(workspace_id));

drop policy if exists "Owner manages gmail credentials" on public.gmail_credentials;
drop policy if exists "Team members read gmail credentials" on public.gmail_credentials;
drop policy if exists "gmail_credentials_select_team" on public.gmail_credentials;
drop policy if exists "gmail_credentials_manage_owner" on public.gmail_credentials;
create policy "gmail_credentials_select_team" on public.gmail_credentials for
select to authenticated using (team_id = (select private.current_team_id()) or public.is_workspace_owner(workspace_id));
create policy "gmail_credentials_manage_owner" on public.gmail_credentials for all to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select on table public.teams to authenticated;
grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;
grant select, insert, update, delete on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.gmail_credentials to authenticated;
grant select, insert on table public.invitations to authenticated;
