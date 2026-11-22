-- L1 People production hardening: archive-only authenticated grants.
-- Truncate is not RLS-gated. App code never hard-deletes People rows (archived_at).
-- Do not edit earlier People migrations; this file is additive.

-- employees
drop policy if exists "employees_delete_team" on public.employees;
revoke all on table public.employees from anon;
revoke all on table public.employees from authenticated;
grant select, insert, update on table public.employees to authenticated;

-- jobs
drop policy if exists "jobs_delete_team" on public.jobs;
revoke all on table public.jobs from anon;
revoke all on table public.jobs from authenticated;
grant select, insert, update on table public.jobs to authenticated;

-- candidates
drop policy if exists "candidates_delete_team" on public.candidates;
revoke all on table public.candidates from anon;
revoke all on table public.candidates from authenticated;
grant select, insert, update on table public.candidates to authenticated;

-- candidate_jobs
drop policy if exists "candidate_jobs_delete_team" on public.candidate_jobs;
revoke all on table public.candidate_jobs from anon;
revoke all on table public.candidate_jobs from authenticated;
grant select, insert, update on table public.candidate_jobs to authenticated;

-- people_message_drafts (discard is a status, not DELETE)
drop policy if exists "people_message_drafts_delete_team" on public.people_message_drafts;
revoke all on table public.people_message_drafts from anon;
revoke all on table public.people_message_drafts from authenticated;
grant select, insert, update on table public.people_message_drafts to authenticated;

-- background_jobs: no DELETE policy; strip leftover DELETE/TRUNCATE grants
revoke all on table public.background_jobs from anon;
revoke all on table public.background_jobs from authenticated;
grant select, insert, update on table public.background_jobs to authenticated;

-- chat_proposed_actions: no DELETE policy
revoke all on table public.chat_proposed_actions from anon;
revoke all on table public.chat_proposed_actions from authenticated;
grant select, insert, update on table public.chat_proposed_actions to authenticated;

-- audit_events: append-only
revoke all on table public.audit_events from anon;
revoke all on table public.audit_events from authenticated;
grant select, insert on table public.audit_events to authenticated;
