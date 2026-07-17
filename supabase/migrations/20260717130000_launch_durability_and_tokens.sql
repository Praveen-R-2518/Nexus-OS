-- Launch durability: n8n job tokens, outbound send queue, inbound reclaim, social approval audit.

create schema if not exists private;

create table if not exists private.n8n_job_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea unique not null,
  action text not null,
  team_id uuid,
  workspace_id uuid,
  organization_id uuid,
  resource_type text,
  resource_id uuid,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

revoke all on table private.n8n_job_tokens from public, anon, authenticated;

create table if not exists public.outbound_jobs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  draft_id uuid references public.reply_drafts (id) on delete set null,
  conversation_id uuid,
  channel text,
  status text not null default 'queued'
    check (status in ('queued', 'claiming', 'sending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists outbound_jobs_draft_id_uidx
  on public.outbound_jobs (draft_id)
  where draft_id is not null;

create index if not exists outbound_jobs_team_status_idx
  on public.outbound_jobs (team_id, status, created_at desc);

create or replace function public.handle_outbound_jobs_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_outbound_jobs_updated_at on public.outbound_jobs;
create trigger trg_outbound_jobs_updated_at
  before update on public.outbound_jobs
  for each row
  execute function public.handle_outbound_jobs_updated_at();

alter table public.outbound_jobs enable row level security;

drop policy if exists outbound_jobs_team_select on public.outbound_jobs;
create policy outbound_jobs_team_select on public.outbound_jobs
  for select to authenticated
  using (team_id = (select private.current_team_id()));

revoke all on table public.outbound_jobs from anon;
revoke insert, update, delete on table public.outbound_jobs from authenticated;
grant select on table public.outbound_jobs to authenticated;

alter table public.inbound_events
  add column if not exists processing_started_at timestamptz;

alter table public.social_posts
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists approval_status text default 'draft';

create or replace function public.claim_stuck_inbound_events(
  p_stale_after_minutes integer default 15,
  p_limit integer default 25
)
returns setof public.inbound_events
language sql
security definer
set search_path = public
as $$
  update public.inbound_events ie
  set status = 'received'
  where ie.id in (
    select e.id
    from public.inbound_events e
    where e.status = 'processing'
      and coalesce(e.processing_started_at, e.received_at)
        < now() - (p_stale_after_minutes || ' minutes')::interval
      and e.attempts < 5
    order by coalesce(e.processing_started_at, e.received_at) asc
    limit p_limit
    for update skip locked
  )
  returning ie.*;
$$;

revoke all on function public.claim_stuck_inbound_events(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_stuck_inbound_events(integer, integer) to service_role;

comment on function public.claim_stuck_inbound_events(integer, integer) is
  'Reclaims inbound_events stuck in processing longer than p_stale_after_minutes (attempts < 5). Service-role only.';

comment on table private.n8n_job_tokens is
  'Hashed single-use tokens for n8n internal job callbacks. Service-role only; not API-exposed.';

comment on table public.outbound_jobs is
  'Durable outbound send queue. Writes are service-role only; team members may SELECT their rows.';
