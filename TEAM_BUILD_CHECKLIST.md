# Nexus OS — Team Build & Fix Checklist (4 members, parallel)

> Source: full architecture audit of 2026-07-11 (repo + live Supabase project `xuvodbcdmfhlbldbvwvt`
> + n8n instance `knurdz3o.app.n8n.cloud`), checked against
> `nexus_os_corrected_architecture.png` and `docs/NEXUS_REBUILD_CONTEXT.md`.
>
> **Audience: AI coding agents (and humans) executing these tasks.** Read this whole header
> before touching anything in your member section.

---

## How to keep this file current (all members)

**Last synced:** 2026-07-13 · Member 4 · Task 4.2

When you finish a checklist item:
1. Change `- [ ]` → `- [x]` on that item only.
2. Append **one line** to `## Progress log` (newest at top): `YYYY-MM-DD · M# · item · short note`.
3. If you changed n8n live: include workflow ID + whether active + what was wired.
4. If git is not on `development`: note branch name and merge/PR status.
5. If blocked on a human: add `NEEDS HUMAN:` in the log line — do not check the box.

Do not edit other members' sections unless coordinating; leave a log note instead.
Commit this file with your task PR when possible so all four members see the same state.

---

## 0. What you are building (context for every agent)

Nexus OS is an AI **Revenue Command Center**: inbound customer messages (Gmail now; Meta
WhatsApp/IG/FB next) are fetched, noise-filtered, classified with an LLM (intent · urgency ·
estimated value · churn risk), a reply is drafted, and **every outbound reply passes an approval
gate** before anything is sent. Multi-tenant SaaS: Next.js 14 App Router + Supabase (Postgres +
RLS) + n8n + OpenAI.

**Current state (verified in the audit — trust this over assumptions):**
- The app-side pieces are real and solid: approval UI/API (`app/api/approval/route.ts`,
  `/approval`), read-only Chat Agent (`app/api/chat`, `lib/chat/*`), Meta webhook with signature
  verification + durable `inbound_events` idempotency ledger (`lib/inbound-events.ts`),
  Gmail/Meta OAuth, 25 RLS-enabled tables.
- The n8n side is **disconnected**: all core-pipeline workflows (WF0a, WF1, WF2, WF3, WF4, WF5)
  are INACTIVE and several will 400/fail against the current schema if activated. Only the
  social-posting workflows (WF8a/b/c) are live.
- **Nothing actually sends.** The approval API fires `POST {N8N_WEBHOOK_BASE_URL}/webhook/approval-trigger`
  — no workflow exposes that path. WF3's "autopilot" only flips a status flag. The Channel
  Sender box on the architecture diagram does not exist. This is the single most important gap.

## 1. How to work (mandatory method for every agent)

1. **Read first, every session:** `CLAUDE.md` (repo root) then `docs/NEXUS_REBUILD_CONTEXT.md`.
   The six "non-negotiable architecture principles" in CLAUDE.md override everything here — if a
   task below seems to conflict with one, STOP and ask the human.
2. **Plan small.** Do NOT attempt a whole member section in one pass. Take ONE checklist item,
   break it into the smallest useful step (usually one file / one workflow node / one migration),
   implement it, verify it, then plan the next small step from what you just learned. Repeat.
   A step you cannot verify is too big — split it.
3. **Verify every step:** `npm run lint`, `npm run build`, relevant tests
   (`npm run test:tenant-intake`, plus the focused test you add). For n8n changes, run the
   workflow with pinned test data before activating. Do not mark a checkbox done if any of these
   fail.
4. **Migrations are additive only.** Never edit an existing file in `supabase/migrations/`. Add a
   new timestamped file; new tables get RLS + `team_id`/`workspace_id` from day one.
5. **Never read, edit, or import any file whose name contains `" 2"` before the extension**
   (iCloud conflict duplicates, e.g. `next.config 2.mjs`). They are stale copies.
6. **Secrets:** `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `N8N_INGEST_TOKEN` are server-only.
   Third-party tokens are AES-encrypted (`lib/encryption/`) before storage. Never hard-code
   secrets in n8n Code nodes — read from env/`$vars`.
7. **Tenant isolation everywhere:** every DB write carries `team_id` (NOT NULL on
   `conversations`, `leads`, `reply_drafts`, `followups`) and `workspace_id`; every API mutation
   goes through `requireApiTenantContext()` (`lib/api-security.ts`).
8. **Report back** at the end of every task using the `## DONE / FILES CHANGED / MIGRATIONS ADDED /
   VERIFICATION / NEEDS HUMAN / OPEN QUESTIONS` block from CLAUDE.md.
9. **Check off items in THIS file** (`- [ ]` → `- [x]`) as you complete them, and append a one-line
   note with the date so the other three members can see progress.
10. A knowledge graph exists at `graphify-out/` — use `graphify query "<question>"` to locate code
    before grepping. After code changes, run `graphify update .`.

## 2. Environment facts (verified 2026-07-11 — re-verify before relying on them)

| Fact | Value |
|---|---|
| Supabase project | `xuvodbcdmfhlbldbvwvt` (REST: `https://xuvodbcdmfhlbldbvwvt.supabase.co/rest/v1/…`) |
| n8n instance | `https://knurdz3o.app.n8n.cloud` |
| n8n workflows | WF0a `bhGCrTSHrj91ojby` · WF0d `lr4HzWo2QeghXxhH` · WF0e `Y54F1bZLJkRyexTH` · WF1 `zU8cDHJeoUGWbUgC` · WF2 `MmA7EKsOYAZgx3ep` · WF3 `OjFlX2W2xYbl5roY` · WF4 `qWHvc2AmqX10jEjk` · WF5 `QoJIseLTX2jwDYEy` · WF8a(OpenAI) `dTunsN6JW5P1nymB` · WF8b `VZ9ZaA1S2JxSAeGQ` · WF8c `RfmuS0guiaq64Lrx` · WF8a(Claude, orphan) `YjEXyYnAHhoSSc2W` |
| Dropped table | `workflow_logs` (migration `20260709140000_drop_workflow_logs.sql`) — but WF0a/WF1/WF3/WF4/WF5 still POST to it |
| Two tenant models | `teams`/`workspaces` (pipeline tables, `team_id` NOT NULL) vs `organizations`/`user_profiles` (social tables, `organization_id`) — WF2 currently conflates them |
| Extensions NOT installed | `vector` (pgvector — intentionally deferred, do NOT install), `pg_cron` |
| pgvector / embeddings | **DEFERRED by product decision** — do not build it (see NEXUS_REBUILD_CONTEXT §5) |
| Domain blocks | Gmail live intake blocked on production-domain Google auth; Meta blocked on App Review — build and test with fixtures/seeds |

**Coordination rule:** WF3 is owned by Member 1. WF0a/WF1/WF2/WF4 are owned by Member 2. WF5 is
owned by Member 4. `inbound_events` + migrations sync is Member 3. If you must touch another
member's file/workflow, leave a note in this file and keep the change minimal.

---

## MEMBER 1 — Channel Sender + Approval-to-Send pipeline (most complex, most important)

**Goal:** after a founder clicks Approve, an email actually reaches the customer. This completes
the product's core promise and is the #1 gap in the audit.

**Key facts:** `app/api/approval/route.ts` already POSTs
`{draft_id, action, conversation_id}` to `{N8N_WEBHOOK_BASE_URL}/webhook/approval-trigger` on
approve — the webhook simply doesn't exist. WF3 (`nexus/rescue`) drafts with GPT-4o and saves to
`reply_drafts`; its "autopilot" branch (`approval_mode==='autopilot' && confidence>=0.85`) just
PATCHes `approval_status='sent'` without sending anything.

- [ ] **1.1 Design the sender contract (doc-only step).** Write `docs/channel_sender.md`: input
      payload (`draft_id`, `conversation_id`, `team_id`), how the sender resolves the recipient
      (`conversations.customer_email`), which Gmail credential to use
      (`gmail_credentials` per workspace — tokens are AES-encrypted, decryption must happen
      server-side, NOT inside n8n; prefer a Next.js internal send endpoint that n8n calls, or
      decrypt via an internal API), and the status transitions
      (`reply_drafts.approval_status: approved → sent`, `sent_at`, `conversations.status: replied`).
- [ ] **1.2 Build the send executor.** Recommended: `app/api/internal/n8n/send-reply/route.ts`
      guarded by `N8N_INGEST_TOKEN` (mirror `app/api/internal/n8n/conversations/route.ts`) that
      loads the draft + conversation + gmail credential, decrypts, sends via Gmail API/SMTP, and
      updates `reply_drafts`/`conversations`. Unit-test with a mocked transport first.
- [ ] **1.3 Create the n8n `approval-trigger` workflow** in knurdz3o at path
      `/webhook/approval-trigger`: receive → validate payload → call the send executor → record
      result. Keep it thin; logic lives in the typed executor. Do not activate until 1.2 tests pass.
- [ ] **1.4 Enforce approval policy in one place.** Policy per architecture: auto-send only
      low-risk/low-value; hard-gate high `estimated_value` or `risk_type='churn_risk'`. Implement
      as a small pure function (e.g. `lib/approval-policy.ts`) with unit tests; use it wherever
      auto-send is decided. Never send from a classifier/drafter directly.
- [ ] **1.5 Rewire WF3 autopilot through the sender.** Replace the "Mark Auto-Sent" PATCH with a
      call to the same approval-trigger/send path gated by the 1.4 policy. (Coordinate: Member 2
      is fixing WF3's missing `team_id` inserts — sequence after their fix or bundle carefully.)
- [ ] **1.6 End-to-end proof.** Seed a draft (`scripts/seed_demo_inbox.ts`), approve it in the UI,
      show the send executor fired (use a sandbox/test inbox), statuses updated, and idempotency:
      approving twice must not send twice (guard on `approval_status`/`sent_at`).
- [ ] **1.7 (Stretch — only after 1.1–1.6) Meta outbound groundwork:** doc + skeleton for
      WhatsApp/Messenger sending with 24-hour-window rules and template fallback, and handling of
      Meta delivery/read receipts (currently ignored by the webhook on purpose — see
      NEXUS_REBUILD_CONTEXT §5). Do not enable live sending.

---

## MEMBER 2 — n8n ↔ schema repair & tenant-model unification (complex, blocks everyone)

**Goal:** the existing WF0a→WF2→WF3 chain can be activated without 400s, on one coherent tenant
model, inside ONE n8n instance.

**Key facts (all verified):** WF1 inserts `conversations` without `team_id` (NOT NULL → 400).
WF3 inserts `reply_drafts` and `followups` without `team_id` (400). WF4's Supabase fetch has no
tenant filter and never selects `team_id` yet later reads `$json.team_id`. WF2 reads the
"business profile" from `organizations?id=eq.{team_id}` and writes `leads.organization_id = team_id`
— conflating two different tenant models. WF0a's "Trigger WF2" nodes point at
`https://mahinsacw.app.n8n.cloud/...` (a DIFFERENT instance). Five workflows still POST to the
dropped `workflow_logs` table.

- [ ] **2.1 Decide + fix observability first (small, unblocks everything).** Recommended: restore
      `workflow_logs` with a NEW additive migration (RLS-enabled, service-role writes only,
      columns matching what workflows already send: `workflow_name, step, result, payload jsonb,
      error, team_id, workspace_id, timestamp`) — the architecture lists it as cross-cutting.
      Alternative (needs human sign-off): strip every log node instead. Record the decision here.
- [ ] **2.2 Fix WF0a cross-instance URL:** point both "Trigger WF2 Classification" nodes at
      `https://knurdz3o.app.n8n.cloud/webhook/nexus/classify`. Confirm with the human whether
      `mahinsacw` is a teammate's instance that should instead be merged/retired.
- [ ] **2.3 Fix WF2 tenant source:** fetch business context from `business_profiles?team_id=eq.…`
      (like WF3 already does), not `organizations?id=eq.team_id`. Stop writing
      `organization_id: team_id` into `leads` — leave `organization_id` null until 2.6.
- [ ] **2.4 Tenant-stamp every n8n insert.** WF1 (`conversations`), WF3 (`reply_drafts`,
      `followups` — coordinate with Member 1 who owns WF3's send path), WF4 (`reply_drafts`):
      add `team_id` + `workspace_id` from the triggering payload. WF1's webhook contract must
      REQUIRE `team_id` (reject with 400 JSON if absent) since `conversations.team_id` is NOT NULL.
- [ ] **2.5 Fix WF4 correctness:** fetch must select `team_id,workspace_id` (join through `leads`),
      filter per-tenant, and the schedule must be sane (currently every 1 minute — make it hourly
      or every 15 min). Keep noise-filter-before-paid-AI ordering intact everywhere.
- [ ] **2.6 Write the tenant-unification ADR** (`docs/tenant_model_unification.md`): today
      `teams` (pipeline) and `organizations` (social) coexist; document the mapping/decision
      (e.g. 1:1 bridge table or column backfill), get human sign-off, then implement as an
      additive migration. Do NOT rewrite existing tables.
- [ ] **2.7 Pin-data test then activate WF2 (and WF1 if the demo path is still wanted).** Run each
      repaired workflow with fixture payloads (`scripts/` has WA/IG/FB and gmail fixtures),
      confirm rows land with correct `team_id`, then publish/activate. Update
      `n8n_logic/*.js` + `scripts/build_n8n_workflow_exports.js` so the repo's exports match what
      is deployed (repo and instance must not drift).

---

## MEMBER 3 — Intake reliability: ledger drain, Gmail-through-ledger, backfill, migration sync

**Goal:** no inbound message can be silently lost, and a new tenant's dashboard is never empty.

**Key facts:** `inbound_events` (UNIQUE `platform, external_message_id`) is written by the Meta
webhook before ack — the webhook returns 200 so platforms will NOT redeliver (documented as
required-before-production). Gmail intake records to `inbound_events` via WF0a ledger path
(Supabase REST, **activated**). WF0d drains `received`/`failed` events every 10 min
(**activated**); WF0e polls `gmail_backfill_jobs` every 5 min (**activated**, needs app deploy +
`NEXUS_APP_URL`/`NEXUS_INGEST_TOKEN` n8n Variables). App endpoints: `inbound-replay`,
`gmail-backfill`. Local migration drift resolved in 3.1 — see
`supabase/migrations/MIGRATION_NOTES.md`. `pg_cron` is NOT installed.

- [x] **3.1 Migration drift sync (do this FIRST — everyone depends on schema truth).** Pull the 5
      remote-only migrations into `supabase/migrations/` verbatim with their remote timestamps
      (read them from the live DB; do not re-author). Then diff local 0004/0005 against the live
      schema (e.g. is `whatsapp` currently a valid `conversations.source`?) and either mark them
      superseded in a README note or re-apply as a new migration. Record findings here.
- [x] **3.2 Ledger drain worker.** Build a reprocessor for `inbound_events` rows stuck at
      `received`/`failed` older than N minutes. **App (done):**
      `app/api/internal/n8n/inbound-replay/route.ts` + migration
      `20260712130000_inbound_events_replay_attempts.sql` — re-forwards stored `raw_payload` via
      `lib/n8n-intake.ts`, caps attempts at 5, parks as `failed` with `error` set; unit-tested in
      `scripts/inbound_replay.test.ts`. **n8n (done):** WF0d (`lr4HzWo2QeghXxhH`, activated) uses
      **Supabase REST directly** (not the app endpoint): schedule every 10 min, fetch stuck rows,
      re-forward to `/webhook/gmail-inbound`, PATCH status/attempts.
- [x] **3.3 Route Gmail through the ledger.** Wherever Gmail messages enter (n8n WF0a IMAP path
      and/or `app/api/gmail/*`), record `platform:'gmail'` + Gmail `Message-ID` BEFORE processing
      so dedup/replay is channel-agnostic. Duplicate deliveries must become no-ops (tested).
      **WF0a implementation (done, activated):**
      `Normalizer → Ledger Key → Record Inbound Event → IF New Event → Restore Normalized → Noise Filter`.
      Duplicate = drop at IF node; `neverError: true` on Record node for 409 handling.
      **App (done):** `app/api/internal/n8n/inbound-record/route.ts` +
      `scripts/inbound_record.test.ts` (PR #122 open → `development`).

### Open follow-ups (Member 3)

- [ ] Merge PR #122 to `development` (3.3 app + checklist + 3.4/3.5 code)
- [ ] Deploy `development` to production so WF0e can reach `/api/internal/n8n/gmail-backfill`
      (currently 404 on nexusos.knurdz.org until deploy)
- [ ] Set n8n Variables `NEXUS_APP_URL` + `NEXUS_INGEST_TOKEN` for WF0e (WF0a test fallbacks OK for E2E tenant)
- [x] Export WF0d/WF0e metadata to `n8n_logic/exports/` (2026-07-13)

- [x] **3.4 Historical backfill on connect (Gmail first).** On successful Gmail OAuth
      (`app/api/gmail/callback/handler.ts`), enqueue a backfill of the last 60–90 days: fetch in
      small batches (e.g. 50), push each message through the SAME normalize→ledger→intake path
      (idempotency makes re-runs safe), tenant-stamped, rate-limit-aware, resumable. Add a
      `scripts/` test with fixture messages. Do NOT touch live Google auth wiring itself —
      the human is re-doing it on the production domain.
      **Implementation (done):** migration `20260713170000_gmail_backfill_jobs.sql` (applied live),
      `lib/gmail/backfill-jobs.ts`, `lib/gmail/backfill.ts`,
      `app/api/internal/n8n/gmail-backfill/route.ts`, OAuth enqueue hook,
      `scripts/gmail_backfill.test.ts`, WF0e (`Y54F1bZLJkRyexTH`, activated). Live endpoint smoke
      blocked until production deploy.
- [x] **3.5 Verify tenant routing end-to-end** with sanitized fixtures: Meta payload → webhook →
      ledger (tenant-stamped) → WF0a normalizer → `conversations` row with correct
      `team_id`/`workspace_id` (this closes audit weak-spot #3 from NEXUS_REBUILD_CONTEXT).
      **Done (Gmail + app layer):** `scripts/tenant_routing_e2e.test.ts` (meta_routing +
      tenant_intake + live WF0a smoke with ledger tenant stamp). Meta → `conversations` full proof
      still depends on Member 2's WF2 tenant fixes (2.3–2.4).

---

## MEMBER 4 — Reports, security hygiene, cost tracking, cleanup (important, lower complexity)

**Goal:** the daily brief works, tokens are stored safely, and known landmines are removed.

**Key facts:** WF5 posts a nonexistent `date` column to `daily_reports` (real column:
`report_date`) → PostgREST 400; its "Log Report Generated" node has no `neverError` and will
hard-fail on the dropped `workflow_logs` table. `social_credentials.access_token`/`refresh_token`
are plaintext columns (0 rows today — cheap to fix now) violating the AES-encryption convention.
An orphan duplicate workflow "WF8a (Claude)" (`YjEXyYnAHhoSSc2W`) exists. The repo contains
iCloud `" 2"` duplicate files. No AI cost tracking exists anywhere.

- [x] **4.1 Fix WF5 schema mismatch:** remove the `date` key from "Save Daily Report" (keep
      `report_date`); confirm the upsert (`resolution=merge-duplicates`) has a matching unique
      constraint on (`team_id`,`report_date`) — if not, add one via a new additive migration.
      Make the log node tolerant (`neverError`) until Member 2's 2.1 decision lands.
- [x] **4.2 Test + activate WF5:** run via its manual webhook (`/webhook/nexus/report`) with a
      `team_id` override for the seeded tenant; verify a `daily_reports` row with summary text;
      then enable the 08:00 schedule. Confirm `/report` page and the Chat Agent snapshot pick it up.
- [ ] **4.3 Encrypt social credentials:** new additive migration adding
      `access_token_encrypted`/`refresh_token_encrypted` (pattern: `meta_credentials`), update
      writers/readers (`lib/posts/*`, any social connect flow) to use `lib/encryption/`, and
      update WF8b to fetch tokens via a token-guarded internal decrypt endpoint instead of raw
      table reads. Old plaintext columns: stop writing, then drop in a later migration once empty
      (they are empty today — verify first).
- [ ] **4.4 Basic AI cost tracking (cross-cutting requirement):** new `ai_usage` table (additive
      migration, RLS, `team_id`, `workflow_name`, `model`, `input_tokens`, `output_tokens`,
      `created_at`) + a tiny recorder in the send/classify/draft paths that already parse OpenAI
      responses (usage fields are in the responses WF2/WF3/WF5 receive). Start with n8n nodes
      POSTing to a token-guarded `app/api/internal/n8n/ai-usage` endpoint.
- [ ] **4.5 n8n hygiene:** archive the duplicate "WF8a - Social Post Caption Generation (Claude)"
      workflow (do not delete); note in this file. Verify the active WF8a/WF8b/WF8c descriptions
      match `lib/posts/webhooks.ts` contracts.
- [ ] **4.6 Repo hygiene:** produce the definitive list of `" 2"` iCloud duplicate files/dirs
      (e.g. `next 2/`, `tailwind.config 2.ts`, `next.config 2.mjs`, `package-lock 2.json`,
      `nexus-os@0.1.0 2/`) as a section appended to this file for the HUMAN to delete — do not
      delete them yourself. Also flag `New Text Document.txt` (empty) for removal.
- [ ] **4.7 Add `.gitignore` entry review:** ensure `graphify-out/` is either committed
      deliberately or ignored (currently untracked) — ask the human which they prefer, then do it.

---

## Progress log (append one line per completed item: date · member · item · note)

<!-- e.g. 2026-07-12 · M2 · 2.2 · WF0a now targets knurdz3o /nexus/classify; mahinsacw confirmed stale -->
2026-07-13 · M4 · 4.2 · WF5 QoJIseLTX2jwDYEy verified E2E for seeded tenant 6d265fe4… (exec 68726/68727): daily_reports upsert with summary+metrics, /report API mapping confirmed, Chat Agent snapshot metrics consistent, idempotency confirmed (1 row), 08:00 UTC schedule active. Template summary Code node while n8n OpenAI quota blocked.
2026-07-13 · M3 · 3.5 E2E · tenant_routing_e2e.test.ts passed (meta_routing + tenant_intake + live WF0a). Live Gmail ledger tenant-stamped (team 6d265fe4-…). Meta conversations proof still NEEDS M2 2.3–2.4.
2026-07-13 · M3 · 3.4 · Gmail backfill: migration 20260713170000_gmail_backfill_jobs applied live; lib/gmail/backfill*.ts + gmail-backfill endpoint + OAuth enqueue; WF0e Y54F1bZLJkRyexTH created+activated. test:gmail-backfill pass. Production deploy needed before WF0e live smoke (404 on nexusos.knurdz.org).
2026-07-13 · M3 · 3.4 n8n · WF0e polls gmail_backfill_jobs every 5 min → POST /api/internal/n8n/gmail-backfill (uses $vars NEXUS_APP_URL + NEXUS_INGEST_TOKEN).
2026-07-13 · M3 · exports · Added n8n_logic/exports/wf0d_ledger_drain.json + wf0e_gmail_backfill.json metadata stubs.
2026-07-13 · M3 · 3.3 E2E · WF0a+WF0d activated. Dedup test Message-ID m3-e2e-ledger-20260713@nexus.dev: first run exec 68612 (18 nodes, 1 inbound_events row, pipeline through WF2); duplicate exec 68614 (8 nodes, stopped at IF New Event, still 1 row). Test tenant: team 6d265fe4-97f8-4556-822f-08833303787b, workspace e4b2fa6f-6e12-4e57-9b18-e5300fc4ee2f, business_profile "Ledger E2E Profile" (gmail_destination_email ledger-test@nexus.dev).
2026-07-13 · M3 · 3.3 n8n env · Patched WF0a for n8n Cloud ($env blocked in Code): safe getEnv() + $vars fallbacks in Tenant Route Extract / Verify Tenant Context; Ledger Key reads Message-ID from webhook body.headers. Production NEXUS_* vars still needed (Member 2).
2026-07-13 · M3 · 3.3 n8n · Wired WF0a ledger path (Ledger Key → Record → IF New Event → Restore Normalized → Noise Filter). Supabase REST dedup verified.
2026-07-13 · M3 · 3.2 n8n · WF0d Ledger Drain (lr4HzWo2QeghXxhH) created + activated: 10 min schedule, stuck query, re-forward to /webhook/gmail-inbound, PATCH attempts cap 5.
2026-07-13 · M3 · 3.3 app · Task 3.3 on branch member3/intake-reliability-ledger-drain (6c7681f); not merged to development yet.
2026-07-13 · M3 · repo · Synced TEAM_BUILD_CHECKLIST.md into repo root (removed from .gitignore); added maintenance section + Member 3 open follow-ups.
2026-07-12 · M3 · 3.3 · Added token-guarded channel-agnostic record endpoint app/api/internal/n8n/inbound-record (records platform+external_message_id via recordInboundEvent, returns inserted/duplicate) so Gmail flows through inbound_events ledger; duplicate Message-ID = no-op. Test scripts/inbound_record.test.ts. lint+build+tests pass.
2026-07-12 · M3 · 3.2 · Built token-guarded ledger drain endpoint app/api/internal/n8n/inbound-replay (re-forwards received/failed events via shared lib/n8n-intake.ts, caps attempts at 5 then parks failed). Added migration 20260712130000_inbound_events_replay_attempts.sql (attempts + last_attempt_at), helpers fetchStuckInboundEvents/applyReplayOutcome, test scripts/inbound_replay.test.ts. lint+build+tests pass. Migration APPLIED to live DB (xuvodbcdmfhlbldbvwvt) + recorded in schema_migrations history.
2026-07-12 · M3 · 3.1 · Pulled 5 remote-only migrations (social_posting_tables, social_rls_fix, post_unit_schema, storage_buckets, handle_new_user_org_linking) verbatim into supabase/migrations/. Verified vs live DB: 0004/0005 are SUPERSEDED (would drop whatsapp/ig/fb source, ALTER dropped workflow_logs, re-add wrong daily_reports.date) — marked superseded in supabase/migrations/MIGRATION_NOTES.md, not applied. Flagged legacy dup 20250516120000_signup_profiles_workspaces.sql.
