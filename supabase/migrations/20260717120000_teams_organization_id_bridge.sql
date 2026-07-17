-- 1:1 teams ↔ organizations bridge (additive).
-- Backfills organization_id on teams from workspace owner user_profiles, and keeps
-- launch_workspace in sync on every team create/reuse.

alter table public.teams
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create unique index if not exists teams_organization_id_uidx
  on public.teams (organization_id)
  where organization_id is not null;

-- Backfill: workspace owner → user_profiles.organization_id. The bridge is 1:1, but live
-- data can have several teams whose workspace owners share one organization (test tenants),
-- so deduplicate per ORGANIZATION too — the team with the earliest workspace wins; later
-- teams keep organization_id null rather than violating teams_organization_id_uidx.
update public.teams t
set organization_id = sub.organization_id
from (
  select distinct on (up.organization_id)
    w.team_id,
    up.organization_id
  from public.workspaces w
  join public.user_profiles up on up.id = w.owner_user_id
  where w.owner_user_id is not null
    and up.organization_id is not null
  order by up.organization_id, w.created_at asc nulls last
) sub
where t.id = sub.team_id
  and t.organization_id is null;

-- Canonical launch_workspace body (live 2026-07-17) + organization_id bridge update.
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
    v_team_id := v_existing_team_id;

    update public.teams t
    set organization_id = up.organization_id
    from public.user_profiles up
    where t.id = v_team_id
      and t.organization_id is null
      and up.id = v_uid
      and up.organization_id is not null
      -- 1:1 bridge: never steal an organization already linked to another team.
      and not exists (
        select 1 from public.teams t2
        where t2.organization_id = up.organization_id
          and t2.id <> v_team_id
      );

    select w.id into v_workspace_id
    from public.workspaces w
    where w.team_id = v_team_id
      and (w.owner_user_id = v_uid or w.owner_user_id is null)
    order by w.created_at asc nulls last
    limit 1;

    if v_workspace_id is null then
      v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
      v_slug := trim(both '-' from v_slug);
      if v_slug is null or v_slug = '' then
        v_slug := 'workspace';
      end if;
      v_slug :=
        v_slug || '-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint ||
        '-' || left(gen_random_uuid()::text, 8);

      insert into public.workspaces (
        name,
        slug,
        workspace_type,
        industry,
        company_size,
        owner_user_id,
        team_id
      )
      values (
        v_name,
        v_slug,
        v_wtype,
        nullif(v_ind, ''),
        nullif(v_size, ''),
        v_uid,
        v_team_id
      )
      returning id into v_workspace_id;
    end if;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, v_uid, 'owner')
    on conflict (workspace_id, user_id) do update set role = 'owner';

    insert into public.business_profiles (team_id, workspace_id, name, industry)
    values (v_team_id, v_workspace_id, v_name, coalesce(nullif(v_ind, ''), 'Technology'))
    on conflict (team_id) do nothing;

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

    return jsonb_build_object(
      'team_id', v_team_id,
      'workspace_id', v_workspace_id,
      'reused', true
    );
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

  update public.teams t
  set organization_id = up.organization_id
  from public.user_profiles up
  where t.id = v_team_id
    and t.organization_id is null
    and up.id = v_uid
    and up.organization_id is not null
    -- 1:1 bridge: never steal an organization already linked to another team.
    and not exists (
      select 1 from public.teams t2
      where t2.organization_id = up.organization_id
        and t2.id <> v_team_id
    );

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
  v_slug :=
    v_slug || '-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint ||
    '-' || left(gen_random_uuid()::text, 8);

  insert into public.workspaces (
    name,
    slug,
    workspace_type,
    industry,
    company_size,
    owner_user_id,
    team_id
  )
  values (
    v_name,
    v_slug,
    v_wtype,
    nullif(v_ind, ''),
    nullif(v_size, ''),
    v_uid,
    v_team_id
  )
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, v_uid, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  insert into public.business_profiles (team_id, workspace_id, name, industry)
  values (v_team_id, v_workspace_id, v_name, coalesce(nullif(v_ind, ''), 'Technology'))
  on conflict (team_id) do nothing;

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

  return jsonb_build_object(
    'team_id', v_team_id,
    'workspace_id', v_workspace_id,
    'reused', false
  );
end;
$$;

revoke all on function public.launch_workspace(text, text[], text, text, text) from public;
revoke all on function public.launch_workspace(text, text[], text, text, text) from anon;
grant execute on function public.launch_workspace(text, text[], text, text, text) to authenticated;

comment on function public.launch_workspace(text, text[], text, text, text) is
  'Retry-safe first-time workspace bootstrap and repair: team, profile.team_id, workspace, business_profiles, owner member, optional invitations; links teams.organization_id from user_profiles.';
