-- Durable inbound ingestion + idempotency (additive, RLS-safe).
-- Channel-agnostic ledger of raw inbound events. Replaces the in-memory dedup Map and the
-- fire-and-forget n8n forward in app/api/meta/webhook/route.ts with persist-before-ack.
-- One row per (platform, external_message_id); UNIQUE makes re-delivery a no-op (ON CONFLICT).
-- Service-role / internal access only — no authenticated client touches this table.

create table if not exists public.inbound_events (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('gmail', 'whatsapp', 'instagram', 'facebook')),
  external_message_id text not null,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  raw_payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'failed')),
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.inbound_events is
  'Channel-agnostic durable ledger of inbound platform events. Idempotency key is (platform, external_message_id). Written before the webhook acks; n8n processing flips status to processing/processed/failed.';

-- Idempotency key: a re-delivered message collides here and is dropped via ON CONFLICT DO NOTHING.
create unique index if not exists inbound_events_platform_message_uidx
  on public.inbound_events (platform, external_message_id);

-- Retry sweep: find events that were persisted but never successfully handed to n8n.
create index if not exists inbound_events_status_received_at_idx
  on public.inbound_events (status, received_at)
  where status in ('received', 'failed');

create index if not exists inbound_events_workspace_id_idx
  on public.inbound_events (workspace_id);

create index if not exists inbound_events_team_id_idx
  on public.inbound_events (team_id);

-- Derive team_id from workspace_id when a tenant is known (mirrors meta_credentials trigger).
-- Only overwrites team_id when a workspace is supplied, so an explicitly-passed team_id on a
-- not-yet-routed event (workspace_id null) is preserved.
create or replace function public.trg_inbound_events_set_team_from_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is not null then
    select w.team_id into new.team_id from public.workspaces w where w.id = new.workspace_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_inbound_events_set_team_from_workspace on public.inbound_events;
create trigger trg_inbound_events_set_team_from_workspace
  before insert or update of workspace_id on public.inbound_events
  for each row
  execute function public.trg_inbound_events_set_team_from_workspace();

create or replace function public.handle_inbound_events_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inbound_events_updated_at on public.inbound_events;
create trigger trg_inbound_events_updated_at
  before update on public.inbound_events
  for each row
  execute function public.handle_inbound_events_updated_at();

-- RLS on from day one. No authenticated/anon policy is created and no grants are issued, so only
-- the service role (which bypasses RLS) can read or write. This table is internal plumbing.
alter table public.inbound_events enable row level security;

revoke all on table public.inbound_events from anon;
revoke all on table public.inbound_events from authenticated;
