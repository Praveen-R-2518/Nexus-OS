-- Wave 1 D1 — Generic tenant-scoped background job queue for People matching (and future work).
-- Modeled on outbound_jobs claim pattern (FOR UPDATE SKIP LOCKED), not gmail_backfill_jobs columns.

create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  kind text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  error text,
  idempotency_key text,
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.background_jobs is
  'Tenant-scoped async work queue. First kind: people.match (candidate scoring batches). Worker: POST /api/internal/people/jobs/run.';

create unique index if not exists background_jobs_team_idempotency_uidx
  on public.background_jobs (team_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists background_jobs_claimable_idx
  on public.background_jobs (status, run_after, created_at)
  where status in ('queued', 'running');

drop trigger if exists trg_background_jobs_set_team_from_workspace on public.background_jobs;
create trigger trg_background_jobs_set_team_from_workspace
  before insert or update of workspace_id on public.background_jobs
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_background_jobs_updated_at on public.background_jobs;
create trigger trg_background_jobs_updated_at
  before update on public.background_jobs
  for each row
  execute function public.handle_chat_sessions_updated_at();

alter table public.background_jobs enable row level security;

drop policy if exists "background_jobs_select_team" on public.background_jobs;
drop policy if exists "background_jobs_insert_team" on public.background_jobs;
drop policy if exists "background_jobs_update_team" on public.background_jobs;

create policy "background_jobs_select_team" on public.background_jobs
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "background_jobs_insert_team" on public.background_jobs
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "background_jobs_update_team" on public.background_jobs
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

revoke all on table public.background_jobs from anon;
grant select, insert, update on table public.background_jobs to authenticated;

-- Atomically claim up to p_limit rows (queued due, or stale running locks). Service-role only.
create or replace function public.claim_background_jobs(
  p_limit int,
  p_locked_by text,
  p_lock_ttl_seconds int default 120
)
returns setof public.background_jobs
language sql
security definer
set search_path = public, pg_catalog
as $$
  with claimable as (
    select j.id
    from public.background_jobs j
    where (
      (j.status = 'queued' and j.run_after <= now())
      or (
        j.status = 'running'
        and j.locked_at is not null
        and j.locked_at < now() - make_interval(secs => greatest(p_lock_ttl_seconds, 1))
      )
    )
    order by j.created_at asc
    for update skip locked
    limit greatest(p_limit, 1)
  )
  update public.background_jobs b
  set
    status = 'running',
    locked_at = now(),
    locked_by = p_locked_by,
    attempts = b.attempts + 1,
    error = null,
    updated_at = now()
  from claimable c
  where b.id = c.id
  returning b.*;
$$;

revoke all on function public.claim_background_jobs(int, text, int) from public, anon, authenticated;
grant execute on function public.claim_background_jobs(int, text, int) to service_role;

comment on function public.claim_background_jobs(int, text, int) is
  'Claims queued (run_after due) or stale-running background_jobs rows for the People worker. Service-role only.';
