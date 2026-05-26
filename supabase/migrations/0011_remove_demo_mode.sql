-- Remove demo channel, demo seed profile, permissive anon policies, and anon table grants.
-- Application and n8n ingest use the Supabase service role (bypasses RLS).

-- Legacy rows
update public.conversations set source = 'manual' where source = 'demo';

-- Allowed sources without demo
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'conversations_source_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations drop constraint conversations_source_check;
  end if;

  alter table public.conversations
    add constraint conversations_source_check
    check (source in ('webhook', 'manual', 'gmail', 'email', 'imap'));
end $$;

alter table public.conversations alter column source set default 'webhook';

delete from public.business_profiles where name = 'Nexus OS Demo Studio';

-- Drop buildathon demo anon policies (from 0002_demo_api_policies.sql)
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

-- Remove anon access to core ops tables (service role + authenticated grants elsewhere)
revoke all on table public.business_profiles from anon;
revoke all on table public.conversations from anon;
revoke all on table public.leads from anon;
revoke all on table public.reply_drafts from anon;
revoke all on table public.followups from anon;
revoke all on table public.workflow_logs from anon;
revoke all on table public.daily_reports from anon;
