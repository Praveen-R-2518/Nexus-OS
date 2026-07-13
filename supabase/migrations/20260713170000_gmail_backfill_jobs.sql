-- Gmail historical backfill job queue (Task 3.4, additive, RLS-safe).
-- One resumable job per workspace; service-role access only.

create table if not exists public.gmail_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  after_date timestamptz not null,
  page_token text,
  messages_fetched integer not null default 0,
  messages_forwarded integer not null default 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.gmail_backfill_jobs is
  'Resumable Gmail inbox backfill jobs enqueued on OAuth connect. Processed in batches by the internal gmail-backfill worker.';

create index if not exists gmail_backfill_jobs_status_created_idx
  on public.gmail_backfill_jobs (status, created_at)
  where status in ('pending', 'running');

create unique index if not exists gmail_backfill_jobs_one_active_per_workspace_uidx
  on public.gmail_backfill_jobs (workspace_id)
  where status in ('pending', 'running');

create or replace function public.handle_gmail_backfill_jobs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gmail_backfill_jobs_updated_at on public.gmail_backfill_jobs;
create trigger trg_gmail_backfill_jobs_updated_at
  before update on public.gmail_backfill_jobs
  for each row
  execute function public.handle_gmail_backfill_jobs_updated_at();

alter table public.gmail_backfill_jobs enable row level security;

revoke all on table public.gmail_backfill_jobs from anon;
revoke all on table public.gmail_backfill_jobs from authenticated;
