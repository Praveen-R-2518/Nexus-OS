-- Break RLS recursion between workspaces and workspace_members using SECURITY DEFINER helpers.
-- Keeps team-wide visibility: teammates share workspace rows via profiles.team_id.

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
