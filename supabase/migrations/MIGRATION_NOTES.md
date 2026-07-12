# Migration notes — drift sync (Task 3.1, Member 3)

_Last synced against live Supabase project `xuvodbcdmfhlbldbvwvt` on 2026-07-12._

## Purpose

The local `supabase/migrations/` folder had drifted from the live database. This note records the
reconciliation so the repo and the live schema are a single source of truth. Migration files are
NEVER edited or deleted — this note documents status instead.

## 1. Remote-only migrations pulled into the repo (verbatim)

These five migrations existed ONLY in the live DB's history
(`supabase_migrations.schema_migrations`) and were missing locally. They were pulled down verbatim
(exact SQL + original remote timestamps), no re-authoring:

| Timestamp (version) | File |
|---|---|
| `20260709115940` | `20260709115940_create_social_posting_tables.sql` |
| `20260709121338` | `20260709121338_fix_social_tables_rls_policies.sql` |
| `20260710094305` | `20260710094305_post_unit_schema_additions.sql` |
| `20260710094342` | `20260710094342_create_storage_buckets_post_media_brand_assets.sql` |
| `20260710115609` | `20260710115609_extend_handle_new_user_with_org_linking.sql` |

## 2. Local-only files — SUPERSEDED, do NOT apply

`0004_gmail_product_alignment.sql` and `0005_remove_whatsapp_from_conversations_source.sql` exist
locally but were NEVER applied to the live DB (no matching entry in remote history). They are STALE:
applying them today would break the current schema. Verified against the live DB on 2026-07-12:

- **conversations.source** — live constraint allows
  `webhook, manual, gmail, email, imap, whatsapp, instagram, facebook`.
  Both 0004 and 0005 would DROP `whatsapp/instagram/facebook`, breaking the Meta unified inbox
  (added by `meta_unified_inbox_foundation`). ❌
- **workflow_logs** — the table DOES NOT EXIST (dropped by `drop_workflow_logs`). 0004 runs
  `alter table public.workflow_logs ...` and would fail immediately. ❌
- **daily_reports** — live table has `report_date` (not `date`). 0004 would ADD a `date` column,
  re-introducing the exact mismatch Member 4 (Task 4.1) has to remove. ❌

**Decision:** 0004 and 0005 are superseded and must not be run. Kept in the repo for history only.
If the human wants them physically removed, that is a separate explicit cleanup — do not delete
here (migrations are treated as additive/append-only).

## 3. Minor observation (for the human, not acted on)

`20250516120000_signup_profiles_workspaces.sql` appears to be a legacy duplicate of
`0006_signup_profiles_workspaces.sql` (the live DB records the applied one as
`20260517010327 0006_signup_profiles_workspaces`). Left untouched; flagging for future cleanup.
