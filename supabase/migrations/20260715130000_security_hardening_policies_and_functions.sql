-- Security hardening (launch blockers from 2026-07-15 audit):
-- 1) organizations.org_insert was WITH CHECK (true) — unrestricted INSERT into the
--    social layer's tenant root (advisor rls_policy_always_true).
--    Org creation normally happens via the SECURITY DEFINER handle_new_user() trigger
--    (owner postgres, bypasses RLS), so authenticated inserts are only legitimate for
--    a user who does not already belong to an organization.
-- 2) Pin search_path on functions flagged by advisor function_search_path_mutable.
-- 3) Revoke direct /rest/v1/rpc execution of trigger/definer helpers from anon and
--    authenticated (triggers do not check EXECUTE at fire time, so this is safe).
--    Intentional RPCs (invite_preview, launch_workspace, is_workspace_member/owner,
--    current_team_id) keep their grants.

-- 1) Scope org_insert to auth.uid() (first-org creation only)
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

-- 2) Pin search_path (bodies reference unqualified public objects)
alter function public.get_user_team_id() set search_path = public;
alter function public.get_user_organization_id() set search_path = public;
alter function public.match_embeddings(uuid, text[], vector, integer) set search_path = public;
alter function public.conversations_set_team_from_profile() set search_path = public;
alter function public.sync_team_id_from_workspace() set search_path = public;
alter function public.sync_workspace_and_team_from_conversation() set search_path = public;
alter function public.handle_chat_sessions_updated_at() set search_path = public;
alter function public.handle_gmail_backfill_jobs_updated_at() set search_path = public;
alter function public.handle_gmail_credentials_updated_at() set search_path = public;
alter function public.handle_inbound_events_updated_at() set search_path = public;
alter function public.handle_meta_credentials_updated_at() set search_path = public;

-- 3) Remove RPC-surface execute grants from trigger/definer helpers
revoke execute on function public.rls_auto_enable() from anon, authenticated;
revoke execute on function public.trg_chat_set_team_from_workspace() from anon, authenticated;
revoke execute on function public.trg_inbound_events_set_team_from_workspace() from anon, authenticated;
revoke execute on function public.trg_meta_credentials_set_team_from_workspace() from anon, authenticated;
revoke execute on function public.trg_workspace_members_after_sync_profile_team() from anon, authenticated;
revoke execute on function public.trg_workspace_members_set_team_from_workspace() from anon, authenticated;
revoke execute on function public.trg_workspaces_before_insert_create_team() from anon, authenticated;
revoke execute on function public.conversations_set_team_from_profile() from anon, authenticated;
revoke execute on function public.sync_team_id_from_workspace() from anon, authenticated;
revoke execute on function public.sync_workspace_and_team_from_conversation() from anon, authenticated;
revoke execute on function public.handle_chat_sessions_updated_at() from anon, authenticated;
revoke execute on function public.handle_gmail_backfill_jobs_updated_at() from anon, authenticated;
revoke execute on function public.handle_gmail_credentials_updated_at() from anon, authenticated;
revoke execute on function public.handle_inbound_events_updated_at() from anon, authenticated;
revoke execute on function public.handle_meta_credentials_updated_at() from anon, authenticated;
-- match_embeddings stays executable by authenticated (SECURITY INVOKER, team-filtered);
-- anon has no business calling it.
revoke execute on function public.match_embeddings(uuid, text[], vector, integer) from anon;
