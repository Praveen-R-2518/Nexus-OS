-- Wave 2 J1 — allow People summaries in the single embeddings table.
-- Chat people/mixed lanes read kind=people_summary. n8n match-embeddings does not.
-- Additive: drop/recreate the kind CHECK only. No new table, no RLS change.

alter table public.embeddings drop constraint if exists embeddings_kind_check;

alter table public.embeddings
  add constraint embeddings_kind_check
  check (kind in ('business_doc', 'conversation', 'summary', 'people_summary'));

comment on column public.embeddings.kind is
  'Vector row type: business_doc | conversation | summary | people_summary. Do not write a kind until a feature reads it.';
