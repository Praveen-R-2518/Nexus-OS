-- NexusOS signup schema (0006)
-- Profiles, teams linkage, workspaces, workspace_members, subscriptions, gmail_credentials + RLS + grants.
-- Each workspace belongs to exactly one team (team may be auto-created on workspace insert).

create extension if not exists pgcrypto;

-- 1. Profiles ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  team_id uuid references public.teams (id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists profiles_team_id_idx on public.profiles (team_id);

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

-- Prevent users from moving themselves to another team after assignment.
create or replace function public.trg_profiles_guard_team_id()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.team_id is not null and new.team_id is distinct from old.team_id then
      raise exception 'Cannot change team_id after it has been set';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_team_id on public.profiles;

create trigger trg_profiles_guard_team_id
before update of team_id on public.profiles for each row
execute function public.trg_profiles_guard_team_id();

-- 2. Workspaces (1:1 team per workspace for this product model) ---------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams (id) on delete cascade,
  name text not null,
  slug text unique not null,
  workspace_type text check (workspace_type in ('solo', 'team')) not null,
  industry text,
  company_size text,
  owner_user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.workspaces
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

create index if not exists workspaces_team_id_idx on public.workspaces (team_id);

-- Auto-create a team when none is supplied (browser signup uses anon + RLS owner path).
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

-- 3. Workspace members ---------------------------------------------------------
create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  role text check (role in ('owner', 'admin', 'member')) default 'member',
  invited_by uuid references auth.users (id),
  joined_at timestamptz default now(),
  team_id uuid references public.teams (id) on delete cascade,
  unique (workspace_id, user_id)
);

alter table public.workspace_members
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

create index if not exists workspace_members_team_id_idx on public.workspace_members (team_id);

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
or
update of workspace_id on public.workspace_members for each row
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

-- 4. Subscriptions -------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  plan_tier text check (plan_tier in ('starter', 'pro', 'team', 'enterprise')),
  billing_cycle text check (billing_cycle in ('monthly', 'annual')),
  dodo_customer_id text,
  dodo_subscription_id text,
  status text check (status in ('trial', 'active', 'past_due', 'canceled', 'pending')) default 'pending',
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now()
);

alter table public.subscriptions
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

create index if not exists subscriptions_team_id_idx on public.subscriptions (team_id);

create or replace function public.trg_subscriptions_set_team_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;

  return new;
end;
$$;

drop trigger if exists trg_subscriptions_set_team_from_workspace on public.subscriptions;

create trigger trg_subscriptions_set_team_from_workspace
before insert
or
update of workspace_id on public.subscriptions for each row
execute function public.trg_subscriptions_set_team_from_workspace();

-- 5. Gmail credentials ---------------------------------------------------------
create table if not exists public.gmail_credentials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  email_address text not null,
  imap_username text not null,
  imap_password_encrypted text not null,
  credential_type text check (credential_type in ('imap', 'oauth')) default 'imap',
  status text check (status in ('pending', 'connected', 'failed')) default 'pending',
  last_verified_at timestamptz,
  created_at timestamptz default now()
);

alter table public.gmail_credentials
  add column if not exists team_id uuid references public.teams (id) on delete cascade;

create index if not exists gmail_credentials_team_id_idx on public.gmail_credentials (team_id);

create or replace function public.trg_gmail_credentials_set_team_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;

  return new;
end;
$$;

drop trigger if exists trg_gmail_credentials_set_team_from_workspace on public.gmail_credentials;

create trigger trg_gmail_credentials_set_team_from_workspace
before insert
or
update of workspace_id on public.gmail_credentials for each row
execute function public.trg_gmail_credentials_set_team_from_workspace();

-- 6. teams table RLS (tight until team-scoped select is added in workspace_scope migration)
alter table public.teams enable row level security;

drop policy if exists "teams deny authenticated select" on public.teams;

create policy "teams deny authenticated select" on public.teams for
select to authenticated using (false);

-- RLS helpers: SECURITY DEFINER reads bypass RLS and break workspaces ↔ workspace_members policy cycles.
create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select
      1
    from
      public.workspaces w
    where
      w.id = p_workspace_id
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
    select
      1
    from
      public.workspace_members m
    where
      m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_workspace_owner(uuid) from public;

revoke all on function public.is_workspace_member(uuid) from public;

grant execute on function public.is_workspace_owner(uuid) to authenticated;

grant execute on function public.is_workspace_member(uuid) to authenticated;

alter table public.profiles enable row level security;

alter table public.workspaces enable row level security;

alter table public.workspace_members enable row level security;

alter table public.subscriptions enable row level security;

alter table public.gmail_credentials enable row level security;

drop policy if exists "Users manage own profile" on public.profiles;

create policy "Users manage own profile" on public.profiles for all to authenticated using (id = (select auth.uid()))
with
  check (id = (select auth.uid()));

drop policy if exists "Owners manage workspace" on public.workspaces;

create policy "Owners manage workspace" on public.workspaces for all to authenticated using (owner_user_id = (select auth.uid()));

drop policy if exists "Members view workspace" on public.workspaces;

create policy "Members view workspace" on public.workspaces for
select to authenticated using (
  public.is_workspace_member(id)
  or (
    team_id is not null
    and team_id = (
      select
        p.team_id
      from
        public.profiles p
      where
        p.id = (select auth.uid())
    )
  )
);

drop policy if exists "Workspace members visible to members" on public.workspace_members;

create policy "Workspace members visible to members" on public.workspace_members for
select to authenticated using (
  user_id = (select auth.uid())
  or public.is_workspace_owner(workspace_id)
  or (
    team_id is not null
    and team_id = (
      select
        p.team_id
      from
        public.profiles p
      where
        p.id = (select auth.uid())
    )
  )
);

drop policy if exists "Owners insert workspace members" on public.workspace_members;

create policy "Owners insert workspace members" on public.workspace_members for insert to authenticated with check (public.is_workspace_owner(workspace_id));

drop policy if exists "Owner views subscription" on public.subscriptions;

create policy "Owner views subscription" on public.subscriptions for all to authenticated using (public.is_workspace_owner(workspace_id));

drop policy if exists "Team members read subscriptions" on public.subscriptions;

create policy "Team members read subscriptions" on public.subscriptions for
select to authenticated using (
  team_id is not null
  and team_id = (
    select
      p.team_id
    from
      public.profiles p
    where
      p.id = (select auth.uid())
  )
);

drop policy if exists "Owner manages gmail credentials" on public.gmail_credentials;

create policy "Owner manages gmail credentials" on public.gmail_credentials for all to authenticated using (public.is_workspace_owner(workspace_id));

drop policy if exists "Team members read gmail credentials" on public.gmail_credentials;

create policy "Team members read gmail credentials" on public.gmail_credentials for
select to authenticated using (
  team_id is not null
  and team_id = (
    select
      p.team_id
    from
      public.profiles p
    where
      p.id = (select auth.uid())
  )
);

grant usage on schema public to authenticated;

grant
select,
insert,
update,
delete on public.profiles to authenticated;

grant
select on public.teams to authenticated;

grant
select,
insert,
update,
delete on public.workspaces to authenticated;

grant
select,
insert,
update,
delete on public.workspace_members to authenticated;

grant
select,
insert,
update,
delete on public.subscriptions to authenticated;

grant
select,
insert,
update,
delete on public.gmail_credentials to authenticated;
