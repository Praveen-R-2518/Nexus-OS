-- Demo API access policies for Nexus OS.
--
-- The n8n workflows currently call Supabase through the REST API with the
-- project's anon key. When row level security is enabled, the anon role needs
-- explicit policies before those workflow inserts/selects can succeed.
--
-- These policies are intentionally permissive for the buildathon demo. Before
-- production, replace anonymous writes with service-role access from n8n and
-- user-scoped RLS policies for the dashboard.

alter table public.business_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.leads enable row level security;
alter table public.reply_drafts enable row level security;
alter table public.followups enable row level security;
alter table public.workflow_logs enable row level security;
alter table public.daily_reports enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.business_profiles to anon, authenticated;
grant select, insert, update on public.conversations to anon, authenticated;
grant select, insert, update on public.leads to anon, authenticated;
grant select, insert, update on public.reply_drafts to anon, authenticated;
grant select, insert, update on public.followups to anon, authenticated;
grant select, insert on public.workflow_logs to anon, authenticated;
grant select, insert, update on public.daily_reports to anon, authenticated;

drop policy if exists "demo anon can read business profiles" on public.business_profiles;
create policy "demo anon can read business profiles"
on public.business_profiles
for select
to anon, authenticated
using (true);

drop policy if exists "demo anon can read conversations" on public.conversations;
create policy "demo anon can read conversations"
on public.conversations
for select
to anon, authenticated
using (true);

drop policy if exists "demo anon can insert conversations" on public.conversations;
create policy "demo anon can insert conversations"
on public.conversations
for insert
to anon, authenticated
with check (true);

drop policy if exists "demo anon can update conversations" on public.conversations;
create policy "demo anon can update conversations"
on public.conversations
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo anon can read leads" on public.leads;
create policy "demo anon can read leads"
on public.leads
for select
to anon, authenticated
using (true);

drop policy if exists "demo anon can insert leads" on public.leads;
create policy "demo anon can insert leads"
on public.leads
for insert
to anon, authenticated
with check (true);

drop policy if exists "demo anon can update leads" on public.leads;
create policy "demo anon can update leads"
on public.leads
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo anon can read reply drafts" on public.reply_drafts;
create policy "demo anon can read reply drafts"
on public.reply_drafts
for select
to anon, authenticated
using (true);

drop policy if exists "demo anon can insert reply drafts" on public.reply_drafts;
create policy "demo anon can insert reply drafts"
on public.reply_drafts
for insert
to anon, authenticated
with check (true);

drop policy if exists "demo anon can update reply drafts" on public.reply_drafts;
create policy "demo anon can update reply drafts"
on public.reply_drafts
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo anon can read followups" on public.followups;
create policy "demo anon can read followups"
on public.followups
for select
to anon, authenticated
using (true);

drop policy if exists "demo anon can insert followups" on public.followups;
create policy "demo anon can insert followups"
on public.followups
for insert
to anon, authenticated
with check (true);

drop policy if exists "demo anon can update followups" on public.followups;
create policy "demo anon can update followups"
on public.followups
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "demo anon can read workflow logs" on public.workflow_logs;
create policy "demo anon can read workflow logs"
on public.workflow_logs
for select
to anon, authenticated
using (true);

drop policy if exists "demo anon can insert workflow logs" on public.workflow_logs;
create policy "demo anon can insert workflow logs"
on public.workflow_logs
for insert
to anon, authenticated
with check (true);

drop policy if exists "demo anon can read daily reports" on public.daily_reports;
create policy "demo anon can read daily reports"
on public.daily_reports
for select
to anon, authenticated
using (true);

drop policy if exists "demo anon can insert daily reports" on public.daily_reports;
create policy "demo anon can insert daily reports"
on public.daily_reports
for insert
to anon, authenticated
with check (true);

drop policy if exists "demo anon can update daily reports" on public.daily_reports;
create policy "demo anon can update daily reports"
on public.daily_reports
for update
to anon, authenticated
using (true)
with check (true);
