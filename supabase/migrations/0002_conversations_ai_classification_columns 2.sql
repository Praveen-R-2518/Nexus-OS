-- Nexus OS: additive classification columns + indexes on public.conversations
-- Safe when re-applied; does not drop or rename columns.

alter table public.conversations
  add column if not exists customer_phone text,
  add column if not exists channel text default 'email',
  add column if not exists intent text,
  add column if not exists urgency text default 'low',
  add column if not exists sentiment text,
  add column if not exists risk_score int default 0,
  add column if not exists estimated_value numeric default 0,
  add column if not exists revenue_at_risk numeric default 0,
  add column if not exists confidence numeric default 0,
  add column if not exists classification jsonb;

comment on column public.conversations.channel is 'Ingest channel label (additive; defaults to email for legacy rows).';

comment on column public.conversations.classification is 'Optional full JSON classification payload from the AI layer.';

create index if not exists conversations_created_at_idx on public.conversations (
  created_at desc
);

create index if not exists conversations_intent_idx on public.conversations (intent);

create index if not exists conversations_urgency_idx on public.conversations (urgency);

create index if not exists conversations_status_idx on public.conversations (status);

create index if not exists conversations_risk_score_idx on public.conversations (risk_score);
