-- Wave 1 A2 — People tables (employees, jobs, candidates, candidate_jobs).
-- Tenant root is teams/workspaces. Soft archive. No compensation columns. No background_jobs (D1).
-- Scoring columns on candidate_jobs are schema-only; no worker in this partition.

-- 1. employees ----------------------------------------------------------------

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role_title text,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'onboarding', 'resignation_pending', 'offboarded')),
  started_on date,
  ended_on date,
  location text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.employees is
  'Company roster (People). Soft-archive via archived_at. Not workspace invites (/team).';

create unique index if not exists employees_team_lower_email_active_uidx
  on public.employees (team_id, lower(email))
  where email is not null and archived_at is null;

create index if not exists employees_team_created_idx
  on public.employees (team_id, created_at desc);

-- 2. jobs ---------------------------------------------------------------------

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  title text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  required_skills jsonb not null default '[]'::jsonb,
  preferred_skills jsonb not null default '[]'::jsonb,
  experience_min_years numeric,
  experience_max_years numeric,
  seniority text,
  location text,
  remote_policy text
    check (remote_policy is null or remote_policy in ('onsite', 'hybrid', 'remote', 'flexible')),
  scoring_weights jsonb not null default '{
    "technical_fit": 0.40,
    "experience_fit": 0.25,
    "seniority_fit": 0.15,
    "location_fit": 0.05,
    "nice_to_have": 0.10,
    "data_quality": 0.05
  }'::jsonb,
  scoring_weights_version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.jobs is
  'Open roles with versioned scoring_weights. Changing weights increments scoring_weights_version; old candidate_jobs scores stay until a re-run.';

create index if not exists jobs_team_status_created_idx
  on public.jobs (team_id, status, created_at desc);

-- 3. candidates ---------------------------------------------------------------

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  headline text,
  "current_role" text,
  experience_years numeric,
  skills jsonb not null default '[]'::jsonb,
  location text,
  source text,
  source_url text,
  source_metadata jsonb not null default '{}'::jsonb,
  consent_status text not null default 'unknown'
    check (consent_status in ('owner_imported', 'candidate_applied', 'unknown')),
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.candidates is
  'Founder-owned candidates with consent_status and source provenance. Soft-archive via archived_at.';

create unique index if not exists candidates_team_lower_email_active_uidx
  on public.candidates (team_id, lower(email))
  where email is not null and archived_at is null;

create index if not exists candidates_team_created_idx
  on public.candidates (team_id, created_at desc);

-- 4. candidate_jobs -----------------------------------------------------------

create table if not exists public.candidate_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  candidate_id uuid not null references public.candidates (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  stage text not null default 'new'
    check (stage in ('new', 'shortlisted', 'contacted', 'decision')),
  match_score numeric,
  match_components jsonb,
  match_weights_used jsonb,
  scoring_version integer,
  data_quality text not null default 'pending'
    check (data_quality in ('pending', 'sufficient', 'insufficient')),
  insufficient_reason text,
  ai_explanation jsonb,
  ai_model text,
  ai_prompt_version text,
  manual_rank_override integer,
  assigned_to uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);

comment on table public.candidate_jobs is
  'Application of a candidate to a job. Four-stage pipeline. Scoring columns nullable until D3.';

create index if not exists candidate_jobs_team_job_idx
  on public.candidate_jobs (team_id, job_id);

create index if not exists candidate_jobs_job_match_score_idx
  on public.candidate_jobs (job_id, match_score desc nulls last);

-- 5. Team-from-workspace stamp + updated_at (reuse existing functions) --------

drop trigger if exists trg_employees_set_team_from_workspace on public.employees;
create trigger trg_employees_set_team_from_workspace
  before insert or update of workspace_id on public.employees
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_employees_updated_at on public.employees;
create trigger trg_employees_updated_at
  before update on public.employees
  for each row
  execute function public.handle_chat_sessions_updated_at();

drop trigger if exists trg_jobs_set_team_from_workspace on public.jobs;
create trigger trg_jobs_set_team_from_workspace
  before insert or update of workspace_id on public.jobs
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_jobs_updated_at on public.jobs;
create trigger trg_jobs_updated_at
  before update on public.jobs
  for each row
  execute function public.handle_chat_sessions_updated_at();

drop trigger if exists trg_candidates_set_team_from_workspace on public.candidates;
create trigger trg_candidates_set_team_from_workspace
  before insert or update of workspace_id on public.candidates
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_candidates_updated_at on public.candidates;
create trigger trg_candidates_updated_at
  before update on public.candidates
  for each row
  execute function public.handle_chat_sessions_updated_at();

drop trigger if exists trg_candidate_jobs_set_team_from_workspace on public.candidate_jobs;
create trigger trg_candidate_jobs_set_team_from_workspace
  before insert or update of workspace_id on public.candidate_jobs
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_candidate_jobs_updated_at on public.candidate_jobs;
create trigger trg_candidate_jobs_updated_at
  before update on public.candidate_jobs
  for each row
  execute function public.handle_chat_sessions_updated_at();

-- 6. RLS ----------------------------------------------------------------------

alter table public.employees enable row level security;
alter table public.jobs enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_jobs enable row level security;

drop policy if exists "employees_select_team" on public.employees;
drop policy if exists "employees_insert_team" on public.employees;
drop policy if exists "employees_update_team" on public.employees;
drop policy if exists "employees_delete_team" on public.employees;

create policy "employees_select_team" on public.employees
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "employees_insert_team" on public.employees
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "employees_update_team" on public.employees
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

create policy "employees_delete_team" on public.employees
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

drop policy if exists "jobs_select_team" on public.jobs;
drop policy if exists "jobs_insert_team" on public.jobs;
drop policy if exists "jobs_update_team" on public.jobs;
drop policy if exists "jobs_delete_team" on public.jobs;

create policy "jobs_select_team" on public.jobs
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "jobs_insert_team" on public.jobs
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "jobs_update_team" on public.jobs
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

create policy "jobs_delete_team" on public.jobs
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

drop policy if exists "candidates_select_team" on public.candidates;
drop policy if exists "candidates_insert_team" on public.candidates;
drop policy if exists "candidates_update_team" on public.candidates;
drop policy if exists "candidates_delete_team" on public.candidates;

create policy "candidates_select_team" on public.candidates
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "candidates_insert_team" on public.candidates
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "candidates_update_team" on public.candidates
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

create policy "candidates_delete_team" on public.candidates
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

drop policy if exists "candidate_jobs_select_team" on public.candidate_jobs;
drop policy if exists "candidate_jobs_insert_team" on public.candidate_jobs;
drop policy if exists "candidate_jobs_update_team" on public.candidate_jobs;
drop policy if exists "candidate_jobs_delete_team" on public.candidate_jobs;

create policy "candidate_jobs_select_team" on public.candidate_jobs
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "candidate_jobs_insert_team" on public.candidate_jobs
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "candidate_jobs_update_team" on public.candidate_jobs
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

create policy "candidate_jobs_delete_team" on public.candidate_jobs
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

revoke all on table public.employees from anon;
revoke all on table public.jobs from anon;
revoke all on table public.candidates from anon;
revoke all on table public.candidate_jobs from anon;

grant select, insert, update, delete on table public.employees to authenticated;
grant select, insert, update, delete on table public.jobs to authenticated;
grant select, insert, update, delete on table public.candidates to authenticated;
grant select, insert, update, delete on table public.candidate_jobs to authenticated;
