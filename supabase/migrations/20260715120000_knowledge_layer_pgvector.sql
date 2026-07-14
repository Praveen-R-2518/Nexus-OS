-- Knowledge layer: pgvector store for the Chat Agent (RAG).
-- Enabled now because business-document upload — the agreed trigger for building this
-- (see docs/NEXUS_REBUILD_CONTEXT.md §5) — is being shipped. One vector store in Supabase,
-- one `embeddings` table tagged by `kind` (CLAUDE.md principle #2). Tenant-scoped by team_id,
-- mirroring the RLS + team-from-workspace pattern in 20260705120000_chat_history.sql.

-- 0. pgvector -----------------------------------------------------------------
create extension if not exists vector;

-- 1. Editable Chat Agent persona (system message) ----------------------------
alter table public.business_profiles
  add column if not exists chat_persona text;

comment on column public.business_profiles.chat_persona is
  'Founder-editable system-message persona for the Chat Agent. NULL = use app DEFAULT_ANALYST_PERSONA. Read-only/no-fabrication guardrails are always appended in code regardless of this value.';

-- 2. embeddings — single vector store, tagged by kind ------------------------
create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  kind text not null check (kind in ('business_doc', 'conversation', 'summary')),
  source_id uuid,                     -- polymorphic: business_documents.id | conversations.id | chat_sessions.id
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),             -- text-embedding-3-small dimensionality
  created_at timestamptz not null default now()
);

create index if not exists embeddings_team_kind_idx
  on public.embeddings (team_id, kind);

create index if not exists embeddings_source_idx
  on public.embeddings (source_id);

-- HNSW: no training step, works on an empty table (unlike ivfflat). Cosine distance.
create index if not exists embeddings_vector_hnsw_idx
  on public.embeddings using hnsw (embedding vector_cosine_ops);

-- 3. business_documents — upload metadata / ingestion status -----------------
create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text not null default '',
  char_count integer not null default 0,
  chunk_count integer not null default 0,
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_documents_team_idx
  on public.business_documents (team_id, created_at desc);

-- 4. Team-from-workspace stamping (reuse the shared trigger fn from chat_history) --
drop trigger if exists trg_embeddings_set_team_from_workspace on public.embeddings;
create trigger trg_embeddings_set_team_from_workspace
  before insert or update of workspace_id on public.embeddings
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_business_documents_set_team_from_workspace on public.business_documents;
create trigger trg_business_documents_set_team_from_workspace
  before insert or update of workspace_id on public.business_documents
  for each row
  execute function public.trg_chat_set_team_from_workspace();

drop trigger if exists trg_business_documents_updated_at on public.business_documents;
create trigger trg_business_documents_updated_at
  before update on public.business_documents
  for each row
  execute function public.handle_chat_sessions_updated_at();

-- 5. RLS — tenant-scoped, team members read + write their own team's rows ----
alter table public.embeddings enable row level security;
alter table public.business_documents enable row level security;

drop policy if exists "embeddings_select_team" on public.embeddings;
drop policy if exists "embeddings_insert_team" on public.embeddings;
drop policy if exists "embeddings_delete_team" on public.embeddings;

create policy "embeddings_select_team" on public.embeddings
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "embeddings_insert_team" on public.embeddings
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "embeddings_delete_team" on public.embeddings
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

drop policy if exists "business_documents_select_team" on public.business_documents;
drop policy if exists "business_documents_insert_team" on public.business_documents;
drop policy if exists "business_documents_update_team" on public.business_documents;
drop policy if exists "business_documents_delete_team" on public.business_documents;

create policy "business_documents_select_team" on public.business_documents
  for select to authenticated
  using (team_id = (select private.current_team_id()));

create policy "business_documents_insert_team" on public.business_documents
  for insert to authenticated
  with check (team_id = (select private.current_team_id()));

create policy "business_documents_update_team" on public.business_documents
  for update to authenticated
  using (team_id = (select private.current_team_id()))
  with check (team_id = (select private.current_team_id()));

create policy "business_documents_delete_team" on public.business_documents
  for delete to authenticated
  using (team_id = (select private.current_team_id()));

grant select, insert, delete on table public.embeddings to authenticated;
grant select, insert, update, delete on table public.business_documents to authenticated;

-- 6. match_embeddings — cosine similarity search, RLS-respecting -------------
-- security invoker (default): RLS on public.embeddings applies for the calling role,
-- and we filter team_id explicitly so a caller can only ever see their own team's rows.
create or replace function public.match_embeddings(
  p_team_id uuid,
  p_kinds text[],
  p_query vector(1536),
  p_match_count integer default 6
)
returns table (
  content text,
  kind text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    e.content,
    e.kind,
    e.metadata,
    1 - (e.embedding <=> p_query) as similarity
  from public.embeddings e
  where e.team_id = p_team_id
    and e.kind = any(p_kinds)
    and e.embedding is not null
  order by e.embedding <=> p_query
  limit greatest(p_match_count, 1);
$$;

grant execute on function public.match_embeddings(uuid, text[], vector, integer) to authenticated;

-- 7. Storage bucket for uploaded business documents (private) ----------------
-- Path convention: {team_id}/{document_id}/{filename} — first folder segment is the team id.
insert into storage.buckets (id, name, public)
values ('business-docs', 'business-docs', false)
on conflict (id) do nothing;

drop policy if exists "business-docs team select" on storage.objects;
drop policy if exists "business-docs team insert" on storage.objects;
drop policy if exists "business-docs team delete" on storage.objects;

create policy "business-docs team select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-docs'
    and (storage.foldername(name))[1]::uuid = (select private.current_team_id())
  );

create policy "business-docs team insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-docs'
    and (storage.foldername(name))[1]::uuid = (select private.current_team_id())
  );

create policy "business-docs team delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-docs'
    and (storage.foldername(name))[1]::uuid = (select private.current_team_id())
  );
