-- Move pgvector out of the public schema (advisor: extension_in_public, WARN).
--
-- Scope confirmed against the live DB before writing this:
--   - embeddings.embedding column: type is OID-bound, unaffected by the move.
--   - embeddings_vector_hnsw_idx (hnsw / vector_cosine_ops): operator class is
--     OID-bound, unaffected by the move. No reindex needed.
--   - match_embeddings(...): the ONLY app-level object that resolves `vector`
--     or the `<=>` operator by unqualified name, under a pinned
--     `SET search_path TO 'public'`. This must be updated in the same
--     migration or retrieval breaks immediately after the extension moves.
--   - `extensions` schema already exists in this project (pgcrypto,
--     uuid-ossp live there already) — no need to create it or grant usage,
--     those grants are already in place for anon/authenticated/service_role.

-- 1. Relocate the extension (vector is relocatable; verified via
--    pg_extension.extrelocatable = true before writing this).
alter extension vector set schema extensions;

-- 2. Re-point match_embeddings' pinned search_path so `<=>` and `vector`
--    still resolve. Uses a local search_path (this session only) purely to
--    resolve the `vector` type in the signature below; does not change any
--    session/role default.
set local search_path to public, extensions;

alter function public.match_embeddings(uuid, text[], vector, integer)
  set search_path to 'public, extensions';

reset search_path;

-- 3. Verification query — run manually after applying, expect one row with a
--    real similarity score (adjust the team_id/kind to real data):
--
--   select * from public.match_embeddings(
--     '<a real team_id>'::uuid,
--     array['knowledge'],
--     (select embedding from public.embeddings limit 1),
--     3
--   );
