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

## 4. Task 4.3 — social credential encryption (2026-07-13)

Applied live to `xuvodbcdmfhlbldbvwvt`:

- Added `access_token_encrypted` / `refresh_token_encrypted` (`text`, nullable) to `social_credentials`
- Dropped `NOT NULL` on legacy `access_token` so writers can stop populating plaintext columns
- Legacy `access_token` / `refresh_token` columns retained (unused); drop deferred pending human sign-off

## 5. Organizations / user_profiles foundation (2026-07-17)

Live `organizations` and `user_profiles` DDL was pulled from project `xuvodbcdmfhlbldbvwvt` on
**2026-07-17** and reconciled into the repo as additive migrations:

| Role | File |
|---|---|
| Foundation (tables, RLS, triggers) | `20260709115800_create_organizations_user_profiles_foundation.sql` |
| Bridge (`teams.organization_id` FK + backfill) | `20260717120000_teams_organization_id_bridge.sql` |

**Do not rewrite applied migrations.** If live drifts again, add a new sequentially-named migration
and document it here — never edit or delete files already recorded in remote
`supabase_migrations.schema_migrations`.

## 5. Schema remediation migrations (2026-07-17)

Greenfield reproducibility + tenant bridge. Apply in timestamp order after existing migrations.

| Timestamp (version) | File | Purpose |
|---|---|---|
| `20260709115700` | `20260709115700_daily_reports_wf_columns.sql` | WF5 `daily_reports` product columns when `0004` was skipped. Does **not** add a `date` column. |
| `20260709115800` | `20260709115800_create_organizations_user_profiles_foundation.sql` | `organizations` + `user_profiles` foundation (live DDL 2026-07-17). Sorts **before** social posting tables. |
| `20260717120000` | `20260717120000_teams_organization_id_bridge.sql` | 1:1 `teams.organization_id` bridge, backfill from workspace owner, `launch_workspace` sync. |
| `20260717130000` | `20260717130000_launch_durability_and_tokens.sql` | `private.n8n_job_tokens`, `outbound_jobs`, inbound reclaim, social approval audit columns. |

**Note:** Section 2 still applies — `0004_gmail_product_alignment.sql` and
`0005_remove_whatsapp_from_conversations_source.sql` must **not** be applied. The remediation
migrations above replace the safe subset of what `0004` would have added.

### Greenfield ordering

```
… → 20260709115700 (daily_reports WF columns)
  → 20260709115800 (organizations / user_profiles)
  → 20260709115940 (social posting tables)
  → …
  → 20260717120000 (teams ↔ org bridge)
  → 20260717130000 (durability + tokens)
```

## 6. Wave 1 A1 — `audit_events` (2026-09-01)

Applied to hosted `xuvodbcdmfhlbldbvwvt` via **Supabase MCP** `apply_migration` (project was
`INACTIVE`; restored with `restore_project` first, then applied when `ACTIVE_HEALTHY`).

| Local file | Remote `schema_migrations` |
|---|---|
| `20260901120000_audit_events.sql` | `20260901070541` / `audit_events` |

Verified: `public.audit_events` exists, RLS enabled, 2 policies (select + insert).

## 7. Wave 1 A2 — People schema (2026-09-01)

Applied to hosted `xuvodbcdmfhlbldbvwvt` via **Supabase MCP** `apply_migration` (project was
already `ACTIVE_HEALTHY`). First apply attempt failed because unquoted `current_role` is a
Postgres reserved word; local SQL quotes `"current_role"`. Re-applied successfully.

| Local file | Remote `schema_migrations` |
|---|---|
| `20260901130000_people_schema.sql` | `20260901072620` / `people_schema` |

Verified: `employees`, `jobs`, `candidates`, `candidate_jobs` exist; RLS enabled; 4 policies
each (select/insert/update/delete) at apply time. **L1** later dropped the DELETE
policies and revoked TRUNCATE/DELETE grants from `authenticated` (see §8).

## 8. L1 — People hardening grants (2026-09-03)

Applied to hosted `xuvodbcdmfhlbldbvwvt` via **Supabase MCP** `apply_migration`.

| Local file | Remote `schema_migrations` |
|---|---|
| `20260903120000_people_hardening_grants.sql` | `20260903051451` / `people_hardening_grants` |

Verified 2026-09-03: `authenticated` has SELECT/INSERT/UPDATE only on
`employees`, `jobs`, `candidates`, `candidate_jobs`, `people_message_drafts`,
`background_jobs`, `chat_proposed_actions`; `audit_events` is SELECT+INSERT.
No DELETE policies on those People tables. `anon` has no table grants.
`service_role` retains full grants (including TRUNCATE). Archive-only in app
code; do not rewrite `20260901130000_people_schema.sql`.
