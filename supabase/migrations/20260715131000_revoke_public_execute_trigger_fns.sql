-- Follow-up to 20260715130000: the trigger/definer helpers also carry the default
-- PUBLIC execute grant (=X in proacl), which anon/authenticated inherit even after the
-- role-specific revokes. Revoke PUBLIC too. Triggers do not check EXECUTE at fire time,
-- and postgres/service_role retain their explicit grants.

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.trg_chat_set_team_from_workspace() from public;
revoke execute on function public.trg_inbound_events_set_team_from_workspace() from public;
revoke execute on function public.trg_meta_credentials_set_team_from_workspace() from public;
revoke execute on function public.trg_workspace_members_after_sync_profile_team() from public;
revoke execute on function public.trg_workspace_members_set_team_from_workspace() from public;
revoke execute on function public.trg_workspaces_before_insert_create_team() from public;
revoke execute on function public.conversations_set_team_from_profile() from public;
revoke execute on function public.sync_team_id_from_workspace() from public;
revoke execute on function public.sync_workspace_and_team_from_conversation() from public;
revoke execute on function public.handle_chat_sessions_updated_at() from public;
revoke execute on function public.handle_gmail_backfill_jobs_updated_at() from public;
revoke execute on function public.handle_gmail_credentials_updated_at() from public;
revoke execute on function public.handle_inbound_events_updated_at() from public;
revoke execute on function public.handle_meta_credentials_updated_at() from public;
