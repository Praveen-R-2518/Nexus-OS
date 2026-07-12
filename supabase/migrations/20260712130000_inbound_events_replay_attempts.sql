-- Replay/drain support for the inbound_events ledger (additive, RLS-safe).
-- The ledger drain worker (app/api/internal/n8n/inbound-replay) re-forwards events stuck at
-- 'received'/'failed' back to n8n. It needs to cap retries, so track attempts + last attempt time.
-- No new grants: inbound_events is service-role only (RLS enabled with no anon/authenticated policy).

alter table public.inbound_events
  add column if not exists attempts integer not null default 0;

alter table public.inbound_events
  add column if not exists last_attempt_at timestamptz;

comment on column public.inbound_events.attempts is
  'Number of replay/forward attempts made by the ledger drain worker. Capped (default 5) before the row is parked as failed.';
comment on column public.inbound_events.last_attempt_at is
  'Timestamp of the most recent replay attempt by the ledger drain worker.';
