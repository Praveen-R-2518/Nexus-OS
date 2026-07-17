-- organizations + user_profiles foundation (additive, idempotent).
-- Pulled from live Supabase project xuvodbcdmfhlbldbvwvt on 2026-07-17 for greenfield
-- reproducibility. Must sort before 20260709115940_create_social_posting_tables.sql.

create extension if not exists "uuid-ossp";

create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  industry text,
  tone text default 'professional',
  services jsonb default '[]'::jsonb,
  pricing_rules jsonb default '{}'::jsonb,
  approval_mode text default 'approval',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  plan_type text default 'starter'
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  full_name text,
  email text,
  role text default 'member',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists user_profiles_organization_id_idx
  on public.user_profiles (organization_id);

create index if not exists organizations_created_at_idx
  on public.organizations (created_at desc);

alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;

create or replace function public.get_user_organization_id()
returns uuid
language sql
security definer
set search_path to 'public'
as $$
  select organization_id
  from public.user_profiles
  where id = auth.uid()
$$;

create or replace function public.get_user_team_id()
returns uuid
language sql
security definer
set search_path to 'public'
as $$
  select team_id
  from public.team_members
  where user_id = auth.uid()
  limit 1
$$;

revoke all on function public.get_user_organization_id() from public, anon;
grant execute on function public.get_user_organization_id() to authenticated;

revoke all on function public.get_user_team_id() from public, anon;
grant execute on function public.get_user_team_id() to authenticated;

drop policy if exists org_insert on public.organizations;
create policy org_insert on public.organizations
  for insert to authenticated
  with check (
    auth.uid() is not null
    and not exists (
      select 1
      from public.user_profiles up
      where up.id = auth.uid()
        and up.organization_id is not null
    )
  );

drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select to authenticated
  using (id = public.get_user_organization_id());

drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations
  for update to authenticated
  using (id = public.get_user_organization_id())
  with check (id = public.get_user_organization_id());

drop policy if exists profile_insert on public.user_profiles;
create policy profile_insert on public.user_profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profile_select on public.user_profiles;
create policy profile_select on public.user_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or organization_id = public.get_user_organization_id()
  );

drop policy if exists profile_update on public.user_profiles;
create policy profile_update on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke all on table public.organizations from anon;
revoke all on table public.user_profiles from anon;

grant select, insert, update on table public.organizations to authenticated;
grant select, insert, update on table public.user_profiles to authenticated;
