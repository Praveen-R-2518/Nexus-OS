# Nexus OS — Team Build & Fix Checklist (4 members, parallel)

> Source: full architecture audit of 2026-07-11 (repo + live Supabase project `xuvodbcdmfhlbldbvwvt`
> + n8n instance `knurdz3o.app.n8n.cloud`), checked against
> `nexus_os_corrected_architecture.png` and `docs/NEXUS_REBUILD_CONTEXT.md`.
>
> **Audience: AI coding agents (and humans) executing these tasks.** Read this whole header
> before touching anything in your member section.

---

## How to keep this file current (all members)

**Last synced:** 2026-07-14 · reconciliation pass — re-grounded against `origin/development` code
(real files, migrations, `package.json` test scripts) and GitHub PR history, not against prior
checkbox state. Found that Member 1 (1.1–1.7) and Member 2 (2.1–2.7) checkboxes below had reverted
to unchecked when Member 3 re-added this file to the repo on `development` (commit `5e6d85b`) from
a stale pre-completion template — the underlying code was never lost, only this file's checkboxes.
Corrected below; see the reconciliation entry at the top of the Progress log for detail.

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

**Current state (code-verified 2026-07-14 against `origin/development` — all 26 items below are
implemented in code and merged; see per-member sections for exact files/migrations/tests, and
"Remaining before production" below for what's still open):**
- **Channel Sender (Member 1) — 7/7 done.** `lib/channel-sender.ts` (`executeSendReply`),
  token-guarded `app/api/internal/n8n/send-reply` + `autopilot-send`, `lib/approval-policy.ts`,
  live `approval-trigger` n8n workflow, `lib/meta/{window,send}.ts` groundwork. Real Gmail send
  still blocked on `gmail.send` OAuth scope (currently `gmail.readonly` only).
- **n8n schema repair (Member 2) — 7/7 done.** WF0a/WF1/WF2/WF3/WF4 tenant-stamped and pointed at
  one instance (`knurdz3o`); `workflow_logs` restored; tenant-unification ADR written (bridge
  migration itself deferred pending human sign-off — see 2.6).
- **Intake reliability (Member 3) — 5/5 done.** Migration drift resolved (`MIGRATION_NOTES.md`);
  ledger drain worker (WF0d) + Gmail-through-ledger (WF0a) + historical backfill (WF0e) all built
  and activated; tenant-routing E2E test in place. Production deploy + n8n Variables still needed
  for WF0e to reach the live app (see Member 3's "Open follow-ups").
- **Reports / hygiene (Member 4) — 7/7 done.** WF5 schema fixed and activated; `social_credentials`
  encryption migration added; `ai_usage` cost-tracking table + endpoint added; orphan WF8a
  archived; repo `" 2"` duplicate inventory produced; `graphify-out/` gitignored.
- App-side pieces remain solid: approval UI/API, Chat Agent, Meta webhook + tenant resolution,
  Gmail/Meta OAuth, encrypted `gmail_credentials` / `meta_credentials`.
- **Not part of this checklist but merged onto `development` since:** PR #124 "new settings page"
  (`app/settings/*`, `app/api/settings/route.ts`) — unrelated feature work, listed here only so it
  isn't mistaken for a missed checklist item.

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
| Extensions NOT installed | `pg_cron` |
| pgvector / embeddings | **BUILT 2026-07-14** — `vector` extension + `embeddings`/`business_documents` + `match_embeddings` RPC + `business-docs` bucket (migration `20260715120000_knowledge_layer_pgvector.sql`). Chat Agent retrieves from it; docs uploaded in Settings → AI & Approval Rules. (Trigger was business-doc upload; see NEXUS_REBUILD_CONTEXT §5.) |
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

- [x] **1.1 Design the sender contract (doc-only step).** Write `docs/channel_sender.md`: input
      payload (`draft_id`, `conversation_id`, `team_id`), how the sender resolves the recipient
      (`conversations.customer_email`), which Gmail credential to use
      (`gmail_credentials` per workspace — tokens are AES-encrypted, decryption must happen
      server-side, NOT inside n8n; prefer a Next.js internal send endpoint that n8n calls, or
      decrypt via an internal API), and the status transitions
      (`reply_drafts.approval_status: approved → sent`, `sent_at`, `conversations.status: replied`).
      **Code check 2026-07-14:** `docs/channel_sender.md` present on `development`.
- [x] **1.2 Build the send executor.** Recommended: `app/api/internal/n8n/send-reply/route.ts`
      guarded by `N8N_INGEST_TOKEN` (mirror `app/api/internal/n8n/conversations/route.ts`) that
      loads the draft + conversation + gmail credential, decrypts, sends via Gmail API/SMTP, and
      updates `reply_drafts`/`conversations`. Unit-test with a mocked transport first.
      **Code check 2026-07-14:** `app/api/internal/n8n/send-reply/route.ts`, `lib/gmail/{send,credentials}.ts`,
      `scripts/send_reply.test.ts` all present on `development`.
- [x] **1.3 Create the n8n `approval-trigger` workflow** in knurdz3o at path
      `/webhook/approval-trigger`: receive → validate payload → call the send executor → record
      result. Keep it thin; logic lives in the typed executor. Do not activate until 1.2 tests pass.
      **Code check 2026-07-14:** `n8n_logic/exports/approval_trigger.json` present; live workflow
      `PtfTN2YTN8bmHzDu` reported ACTIVE as of 2026-07-13 (not re-checked live this pass).
- [x] **1.4 Enforce approval policy in one place.** Policy per architecture: auto-send only
      low-risk/low-value; hard-gate high `estimated_value` or `risk_type='churn_risk'`. Implement
      as a small pure function (e.g. `lib/approval-policy.ts`) with unit tests; use it wherever
      auto-send is decided. Never send from a classifier/drafter directly.
      **Code check 2026-07-14:** `lib/approval-policy.ts` + `scripts/approval_policy.test.ts` present.
- [x] **1.5 Rewire WF3 autopilot through the sender.** Replace the "Mark Auto-Sent" PATCH with a
      call to the same approval-trigger/send path gated by the 1.4 policy. (Coordinate: Member 2
      is fixing WF3's missing `team_id` inserts — sequence after their fix or bundle carefully.)
      **Code check 2026-07-14:** `lib/channel-sender.ts` (`autopilotSend()`) +
      `app/api/internal/n8n/autopilot-send/route.ts` + `scripts/autopilot_send.test.ts` present;
      `n8n_logic/exports/wf3_revenue_rescue.json` reflects the rewired HTTP node. WF3 reported
      INACTIVE live (by design — real Gmail send still needs `gmail.send` scope).
- [x] **1.6 End-to-end proof.** Seed a draft (`scripts/seed_demo_inbox.ts`), approve it in the UI,
      show the send executor fired (use a sandbox/test inbox), statuses updated, and idempotency:
      approving twice must not send twice (guard on `approval_status`/`sent_at`).
      **Code check 2026-07-14:** `scripts/send_e2e.integration.ts` (`test:send-e2e`) +
      `scripts/e2e_live_hop.ts` present; sandbox transport gated by `CHANNEL_SENDER_TRANSPORT`.
      Live hop proven connected end-to-end 2026-07-13; final green send deploy-gated on
      `CHANNEL_SENDER_TRANSPORT=sandbox` being set on the deploy (external/deploy dependency, not
      a code gap).
- [x] **1.7 (Stretch — only after 1.1–1.6) Meta outbound groundwork:** doc + skeleton for
      WhatsApp/Messenger sending with 24-hour-window rules and template fallback, and handling of
      Meta delivery/read receipts (currently ignored by the webhook on purpose — see
      NEXUS_REBUILD_CONTEXT §5). Do not enable live sending.
      **Code check 2026-07-14:** `docs/meta_outbound.md`, `lib/meta/window.ts`, `lib/meta/send.ts`
      (`sendMetaMessage()` throws 501 — no live send path, as intended),
      `scripts/meta_window.test.ts` (`test:meta-window`) all present.

**▶ Member 1: 7 / 7 items complete — 100%.** Only external deps remain: `gmail.send` OAuth scope
for real sends, and the `CHANNEL_SENDER_TRANSPORT=sandbox` deploy flag for a fully green live-hop test.

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

- [x] **2.1 Decide + fix observability first (small, unblocks everything).** Recommended: restore
      `workflow_logs` with a NEW additive migration (RLS-enabled, service-role writes only,
      columns matching what workflows already send: `workflow_name, step, result, payload jsonb,
      error, team_id, workspace_id, timestamp`) — the architecture lists it as cross-cutting.
      Alternative (needs human sign-off): strip every log node instead. Record the decision here.
      **Code check 2026-07-14:** Decision was RESTORE; `supabase/migrations/20260713160000_restore_workflow_logs.sql`
      present on `development` (table + indexes + workspace→team trigger + RLS).
- [x] **2.2 Fix WF0a cross-instance URL:** point both "Trigger WF2 Classification" nodes at
      `https://knurdz3o.app.n8n.cloud/webhook/nexus/classify`. Confirm with the human whether
      `mahinsacw` is a teammate's instance that should instead be merged/retired.
      **Code check 2026-07-14:** `n8n_logic/exports/wf0a_gmail_intake.json` targets `knurdz3o`;
      `mahinsacw` treated as retired per progress log.
- [x] **2.3 Fix WF2 tenant source:** fetch business context from `business_profiles?team_id=eq.…`
      (like WF3 already does), not `organizations?id=eq.team_id`. Stop writing
      `organization_id: team_id` into `leads` — leave `organization_id` null until 2.6.
      **Code check 2026-07-14:** `n8n_logic/exports/wf2_classification.json` fetches
      `business_profiles?team_id=eq`; `Create Lead` node no longer sets `organization_id`.
- [x] **2.4 Tenant-stamp every n8n insert.** WF1 (`conversations`), WF3 (`reply_drafts`,
      `followups` — coordinate with Member 1 who owns WF3's send path), WF4 (`reply_drafts`):
      add `team_id` + `workspace_id` from the triggering payload. WF1's webhook contract must
      REQUIRE `team_id` (reject with 400 JSON if absent) since `conversations.team_id` is NOT NULL.
      **Code check 2026-07-14:** `n8n_logic/exports/{wf1_message_intake,wf3_revenue_rescue,wf4_followup_scheduler}.json`
      all stamp `team_id`/`workspace_id`; WF1 has a "Require Tenant" 400-gate node.
- [x] **2.5 Fix WF4 correctness:** fetch must select `team_id,workspace_id` (join through `leads`),
      filter per-tenant, and the schedule must be sane (currently every 1 minute — make it hourly
      or every 15 min). Keep noise-filter-before-paid-AI ordering intact everywhere.
      **Code check 2026-07-14:** `wf4_followup_scheduler.json` schedule is 15 min; explicit
      `team_id`/`workspace_id` select via `followups`+`leads` embed.
- [x] **2.6 Write the tenant-unification ADR** (`docs/tenant_model_unification.md`): today
      `teams` (pipeline) and `organizations` (social) coexist; document the mapping/decision
      (e.g. 1:1 bridge table or column backfill), get human sign-off, then implement as an
      additive migration. Do NOT rewrite existing tables.
      **Code check 2026-07-14:** `docs/tenant_model_unification.md` present — ADR recommends a
      1:1 team↔org bridge; **the bridge migration itself is intentionally NOT built**, pending
      human sign-off. This is the one sub-part of M2 still open by design, not by omission.
- [x] **2.7 Pin-data test then activate WF2 (and WF1 if the demo path is still wanted).** Run each
      repaired workflow with fixture payloads (`scripts/` has WA/IG/FB and gmail fixtures),
      confirm rows land with correct `team_id`, then publish/activate. Update
      `n8n_logic/*.js` + `scripts/build_n8n_workflow_exports.js` so the repo's exports match what
      is deployed (repo and instance must not drift).
      **Code check 2026-07-14:** `scripts/wf2_tenant_contract.test.ts` (`test:wf2-contract`)
      present; WF2 `MmA7EKsOYAZgx3ep` reported ACTIVE and published (not re-checked live this pass).

**▶ Member 2: 7 / 7 items complete — 100%.** 2.6's bridge migration remains sign-off-gated by
design. Known open flags from the 2026-07-13 self-audit (still worth tracking, not blocking):
(a) WF2 silently drops messages for tenants with no `business_profiles` row; (b) WF2 classifies via
OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`, not GPT-4o as CLAUDE.md states — needs a human
decision on model/vendor; (c) WF2→WF3 payload omits `workspace_id` (DB trigger backfills it, but
inconsistent). Flag re: WF0a's `$env` usage (n8n Cloud blocks `$env` in node expressions) —
**code-verified fixed 2026-07-14**: `wf0a_gmail_intake.json`'s Code nodes now read
`NEXUS_WORKSPACE_ID` through a guarded `getEnv()` helper (`$env` → `process.env` fallback), not a
raw `$env.X` expression; live-runtime behavior not re-tested this pass.

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

- [x] Merge PR #122 to `development` (3.3 app + checklist + 3.4/3.5 code) — **merged 2026-07-13**
      (`03b115b`, confirmed via `gh pr view 122`).
- [ ] Deploy `development` to production so WF0e can reach `/api/internal/n8n/gmail-backfill`
      (currently 404 on nexusos.knurdz.org until deploy) — external/deploy dependency, not code.
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

**▶ Member 3: 5 / 5 items complete — 100%.** Remaining follow-ups are deploy/config, not code.

---

## MEMBER 4 — Reports, security hygiene, cost tracking, cleanup (important, lower complexity)

**Goal:** the daily brief works, tokens are stored safely, and known landmines are removed.

**Key facts:** WF5 posts a nonexistent `date` column to `daily_reports` (real column:
`report_date`) → PostgREST 400; its "Log Report Generated" node has no `neverError` and will
hard-fail on the dropped `workflow_logs` table. `social_credentials.access_token`/`refresh_token`
are plaintext columns (0 rows today — cheap to fix now) violating the AES-encryption convention.
Orphan duplicate WF8a (Claude) `YjEXyYnAHhoSSc2W` was archived 2026-07-13 (task 4.5). The repo contains
iCloud `" 2"` duplicate files. No AI cost tracking exists anywhere.

- [x] **4.1 Fix WF5 schema mismatch:** remove the `date` key from "Save Daily Report" (keep
      `report_date`); confirm the upsert (`resolution=merge-duplicates`) has a matching unique
      constraint on (`team_id`,`report_date`) — if not, add one via a new additive migration.
      Make the log node tolerant (`neverError`) until Member 2's 2.1 decision lands.
- [x] **4.2 Test + activate WF5:** run via its manual webhook (`/webhook/nexus/report`) with a
      `team_id` override for the seeded tenant; verify a `daily_reports` row with summary text;
      then enable the 08:00 schedule. Confirm `/report` page and the Chat Agent snapshot pick it up.
- [x] **4.3 Encrypt social credentials:** new additive migration adding
      `access_token_encrypted`/`refresh_token_encrypted` (pattern: `meta_credentials`), update
      writers/readers (`lib/posts/*`, any social connect flow) to use `lib/encryption/`, and
      update WF8b to fetch tokens via a token-guarded internal decrypt endpoint instead of raw
      table reads. Old plaintext columns: stop writing, then drop in a later migration once empty
      (they are empty today — verify first).
- [x] **4.4 Basic AI cost tracking (cross-cutting requirement):** new `ai_usage` table (additive
      migration, RLS, `team_id`, `workflow_name`, `model`, `input_tokens`, `output_tokens`,
      `created_at`) + a tiny recorder in the send/classify/draft paths that already parse OpenAI
      responses (usage fields are in the responses WF2/WF3/WF5 receive). Start with n8n nodes
      POSTing to a token-guarded `app/api/internal/n8n/ai-usage` endpoint.
- [x] **4.5 n8n hygiene:** archive the duplicate "WF8a - Social Post Caption Generation (Claude)"
      workflow (do not delete); note in this file. Verify the active WF8a/WF8b/WF8c descriptions
      match `lib/posts/webhooks.ts` contracts.
      **Hygiene note (2026-07-13):** Archived orphan `YjEXyYnAHhoSSc2W` ("WF8a - Social Post
      Caption Generation (Claude) [ARCHIVED]") via `POST /api/v1/workflows/{id}/archive`; active
      false, isArchived true, not deleted. App calls path `/webhook/social-post-input` → active
      WF8a `dTunsN6JW5P1nymB` (OpenAI), not the orphan. **Contract verification vs
      `lib/posts/webhooks.ts`:** WF8a input match (`orgId`, `mediaUrl`, `userDescription`,
      `platforms`); **response mismatch** — `Return Draft Post` passthrough of PostgREST insert is
      likely a one-element array, app expects single `SocialPost`. WF8c match (`generate-post-image`,
      `{ orgId, prompt, parentGenerationId }` → `{ generation_id, image_path, signed_url,
      enhanced_prompt }`). WF8b not in `webhooks.ts` (by design); live path `/webhook/publish-social-post`
      expects `{ postId, orgId }`; LinkedIn skipped in `Build Platform Post Items` (`SUPPORTED` =
      instagram/facebook/x only).
- [x] **4.6 Repo hygiene:** produce the definitive list of `" 2"` iCloud duplicate files/dirs
      (e.g. `next 2/`, `tailwind.config 2.ts`, `next.config 2.mjs`, `package-lock 2.json`,
      `nexus-os@0.1.0 2/`) as a section appended to this file for the HUMAN to delete — do not
      delete them yourself. Also flag `New Text Document.txt` (empty) for removal.
      See inventory subsection below.

### 4.6 — iCloud duplicate / cruft inventory (for human deletion, DO NOT auto-delete)

**None of the files below have been opened or deleted by the agent. Human review required before deletion.**

Scanned 2026-07-13 with three cross-validated methods (PowerShell `Get-ChildItem` recursive name
match, `git ls-files` filter, `cmd dir /s /b "* 2*"`); all returned **15** `" 2"` paths. Excluded
`node_modules`, `.git`, `.next`. All 15 are **git-tracked**; all share mtime `2026-07-13 20:05:40`
(likely iCloud sync stamp). Every `" 2"` path has a canonical non-`" 2"` counterpart present.

**Correction vs audit examples:** `next 2` and `nexus-os@0.1.0 2` are **zero-byte files**, not
directories.

#### Repo root (`" 2"` duplicates)

- `next 2` — 0 B — 2026-07-13 20:05:40 — empty file; canonical `next` exists
- `next-env.d 2.ts` — 233 B — 2026-07-13 20:05:40 — canonical `next-env.d.ts` exists
- `next.config 2.mjs` — 1721 B — 2026-07-13 20:05:40 — canonical `next.config.mjs` exists
- `nexus-os@0.1.0 2` — 0 B — 2026-07-13 20:05:40 — empty file; canonical `nexus-os@0.1.0` exists
- `package-lock 2.json` — 283706 B — 2026-07-13 20:05:40 — canonical `package-lock.json` exists
- `tailwind.config 2.ts` — 1967 B — 2026-07-13 20:05:40 — canonical `tailwind.config.ts` exists
- `trigger.config 2.ts` — 634 B — 2026-07-13 20:05:40 — canonical `trigger.config.ts` exists

#### `n8n_logic/`

- `n8n_logic/multi_channel_normalizer 2.js` — 12611 B — 2026-07-13 20:05:40 — canonical `multi_channel_normalizer.js` exists
- `n8n_logic/noise_filter 2.js` — 4296 B — 2026-07-13 20:05:40 — canonical `noise_filter.js` exists
- `n8n_logic/workflow_4_buy_back_report 2.js` — 4653 B — 2026-07-13 20:05:40 — canonical `workflow_4_buy_back_report.js` exists

#### `public/`

- `public/logo 2.png` — 6696 B — 2026-07-13 20:05:40 — canonical `public/logo.png` exists

#### `scripts/`

- `scripts/member4_classification_tests 2.js` — 10336 B — 2026-07-13 20:05:40 — canonical `scripts/member4_classification_tests.js` exists
- `scripts/smoke_classification_openai 2.js` — 2762 B — 2026-07-13 20:05:40 — canonical `scripts/smoke_classification_openai.js` exists
- `scripts/test-buy-back-report 2.mjs` — 5282 B — 2026-07-13 20:05:40 — canonical `scripts/test-buy-back-report.mjs` exists

#### `supabase/.temp/`

- `supabase/.temp/cli-latest 2` — 7 B — 2026-07-13 20:05:40 — canonical `supabase/.temp/cli-latest` exists; parent dir is gitignored (`/supabase/.temp/` in `.gitignore`) but this duplicate is still tracked

#### Other cruft (non-`" 2"` pattern)

- `New Text Document.txt` — 0 B — 2026-07-13 20:05:40 — empty junk file at repo root; **git-tracked**; safe to delete after human review
- No `.DS_Store`, `Thumbs.db`, or `Untitled*` files found outside ignored areas (`.DS_Store` / `Thumbs.db` already in `.gitignore`)

**Human action:** delete the 15 `" 2"` paths and `New Text Document.txt`, then run `git rm` on each
tracked path and commit. Do not delete canonical (non-`" 2"`) files.

- [x] **4.7 Add `.gitignore` entry review:** ensure `graphify-out/` is either committed
      deliberately or ignored — resolved: gitignored (`/graphify-out/` in `.gitignore`; regenerable via `graphify update .`).

**▶ Member 4: 7 / 7 items complete — 100%.**

---

## 5. RELEASE HARDENING — deep-scan findings of 2026-07-14 (post-checklist audit)

**Source:** full pre-release audit (code + live Supabase + live n8n) on 2026-07-14. These are the
bugs that survived the 26-item build — including the real reasons the founder's Gmail test never
reached the dashboard. Root causes, in order of impact:

1. **WF2 parse wiring bug** — `Record AI Usage (WF2)` was inserted BETWEEN `Classify Message` and
   `Parse AI Response` (task 4.4, 2026-07-13), so Parse read the ai-usage endpoint's response
   instead of the LLM output → **every classification since collapsed to the
   `classification_failed` fallback** (`other/medium/0.3`), proven by execution 68758 where the
   model returned `pricing_request/0.95` and the lead was still written as fallback.
2. **`business_profiles` had no unique constraint on `team_id`** — the Gmail-callback upsert
   (`onConflict: "team_id"`, added in c9b44e7) failed silently on EVERY connect ("no unique or
   exclusion constraint matching the ON CONFLICT specification") → new tenants never got a routing
   row → WF0a could never match their inbox.
3. **No continuous Gmail intake existed** — WF0a's IMAP trigger node is disabled with no
   credential; only the test webhook fed it. Backfill (WF0e) covers history only and is
   deploy-blocked. Nothing pulled NEW mail for OAuth-connected accounts.
4. **Founder's tenant predated the fixes** — connected 2026-07-09 (before the backfill-enqueue
   hook and profile upsert existed), so team `ce71d8cf…` had no business_profile row, no backfill
   job, `last_synced_at` NULL, zero conversations.
5. **`ai_usage` migration was never applied live** — the endpoint WF2/WF3 POST to had no table.

### 5.A Google OAuth signup fix (Safari hang / Chrome error-tab)

- [x] **5.1 HMAC-sign the OAuth state** (`app/api/gmail/helpers.ts`): payload now carries `iat`,
      signed SHA-256 HMAC keyed off `ENCRYPTION_KEY` (domain-separated), 10-min expiry, tamper +
      legacy-unsigned rejection. `oauthConfigError()` now also requires `ENCRYPTION_KEY`.
      Test: `scripts/gmail_oauth_state.test.ts` (`test:gmail-oauth-state`) 9/9.
- [x] **5.2 Session-independent callback** (`app/api/gmail/callback/handler.ts`): when Safari ITP
      drops the session cookie on the Google→app redirect, the callback now proceeds on the
      verified signed state via the service-role client instead of dead-ending at `/login`
      (the old behavior = the "stuck loading forever" bug). Session-present path unchanged,
      including the user-mismatch guard. Test: `scripts/gmail_callback_hardening.test.ts`
      (`test:gmail-callback`) updated + green.
- [x] **5.3 Error surfacing + status polling** (`components/signup/StepGmail.tsx`): the component
      compared `gmail_error === "true"` but the server sends reason codes → errors NEVER displayed.
      Now maps all 14 reason codes to human messages, and polls `/api/gmail/status` every 2s (max
      60s) after the redirect so the step advances even on a flaky redirect chain.
- [x] **5.4 Host-mismatch warning** (`app/api/gmail/connect/route.ts`): logs loudly when the
      request host ≠ `NEXT_PUBLIC_SITE_URL` host — that mismatch strands the callback on the other
      host (the Chrome "error in another tab while my tab advanced" report).
- [ ] **5.5 NEEDS HUMAN: re-test signup Gmail connect in Safari + Chrome on the production domain**
      after deploy (the code paths are unit-tested; the browser-specific behavior needs a live run).

### 5.B Classification pipeline repair (the empty-dashboard fixes)

- [x] **5.6 WF2 parse wiring fix** (live `MmA7EKsOYAZgx3ep`, published): `Parse AI Response` now
      reads `$('Classify Message').first().json` explicitly; interposed usage-recording can no
      longer corrupt parsing. Repo export re-synced; `test:wf2-contract` extended (asserts the
      node reference + forbids `items[0]`) — 5/5 green.
- [x] **5.7 WF2 → OpenAI gpt-4o** (same publish): `Classify Message` →
      `https://api.openai.com/v1/chat/completions`, auth `Bearer {{ $vars.OPENAI_API_KEY }}`,
      model `gpt-4o` (OpenRouter Nemotron free-tier removed — resolves M2 flag (c)).
- [x] **5.8 WF2 no-business-profile logging** (same publish): `Fetch Business Profile` is
      `alwaysOutputData`; new `Is Profile Missing` → `Log Missing Business Profile`
      (workflow_logs, `result: no_business_profile`, neverError) — resolves M2 flag (a): missing
      profiles now classify with generic defaults AND leave a trace.
- [x] **5.9 `business_profiles.team_id` unique index** — migration
      `20260714200000_business_profiles_team_unique.sql`, applied live (0 duplicates verified).
      The callback profile-upsert works for the first time.
- [x] **5.10 `ai_usage` migration applied live** (was local-only since 4.4).
- [x] **5.11 Founder tenant seeded live**: `business_profiles` row for team `ce71d8cf…`
      (`gmail_destination_email = senukadeneth00@gmail.com`, workspace `2472750e…` "Knurdz") +
      pending `gmail_backfill_jobs` row (60-day window). His inbox routes as soon as WF0e/WF0f can
      reach the deployed app.
- [x] **5.12 Continuous Gmail sync worker**: new token-guarded
      `app/api/internal/n8n/gmail-sync/{route,handler}.ts` — walks sync-enabled OAuth
      `gmail_credentials`, lists messages since `last_synced_at` (Gmail API), forwards through the
      SAME WF0a ledger path (Message-ID dedup), per-workspace error isolation, updates
      `last_synced_at`/`last_sync_error`. Test: `scripts/gmail_sync.test.ts` (`test:gmail-sync`)
      6/6. New n8n **WF0f Gmail Sync** `rNjW8GyWfZHuXnnf` (10-min schedule → the endpoint),
      **created INACTIVE** — activate only after production deploy. Export stub added.

### 5.C OpenRouter/Gemini → OpenAI (user decision 2026-07-14: full swap)

- [x] **5.13 WF8c full OpenAI swap** (live `RfmuS0guiaq64Lrx`, published): `Enhance Prompt` →
      OpenAI `gpt-4o-mini`; `Generate Image (gpt-image-1)` → `/v1/images/generations`
      (1024×1024, still `data[0].b64_json`); `post_generations.model` records `gpt-image-1`.
      Export stub `wf8c_post_image_generation.json` added.
- [x] **5.14 WF5 GPT summary restored** (live `QoJIseLTX2jwDYEy`, published): new
      `Generate AI Summary (OpenAI)` (gpt-4o, neverError, retry×2) between `Aggregate Stats` and
      `Build Report Summary`; template summary kept as automatic fallback
      (`summary_source: gpt-4o|template`). Export stub updated.
- [ ] **5.15 NEEDS HUMAN: create n8n Variable `OPENAI_API_KEY`** (Settings → Variables) once
      credits land — WF2/WF5/WF8c all read `$vars.OPENAI_API_KEY`; until then WF2 classification
      errors (logged to workflow_logs), WF5 falls back to template, WF8c fails. WF3 uses the n8n
      OpenAI credential (unchanged) — top up the same OpenAI account.

### 5.D Production-readiness code fixes

- [x] **5.16 Settings PATCH silent failures** (`app/api/settings/route.ts`): the two `workspaces`
      updates now check errors and return 500 instead of falsely reporting success (PR #124 gap).
- [x] **5.17 Meta callback no-op ternaries** (`app/api/meta/callback/route.ts:276-279`):
      `ig_*`/`wa_*` fields now null out on non-matching platforms instead of cross-writing
      credentials.
- [x] **5.18 Lint enforced in builds** (`next.config.mjs`): `ignoreDuringBuilds: false`
      (lint is green).
- [x] **5.19 Audit false-alarm recorded**: "missing RLS on conversations/reply_drafts" claim was
      checked against live `pg_policies` and REFUTED — full tenant-scoped authenticated policies
      exist. No action needed; noted so nobody "fixes" it.
- [ ] **5.20 Follow-up (small): Meta OAuth state is still unsigned base64**
      (`app/api/meta/helpers.ts`) — it keeps the session-cookie requirement so it works, but should
      adopt the same HMAC pattern as Gmail for consistency and Safari resilience.

**▶ Release hardening: 16 / 19 done** — the 3 open items are human/deploy-gated (5.5, 5.15, 5.20).

---

## Overall build progress (code-verified 2026-07-14 against `origin/development`)

| Member | Track | Done | Total | % |
|--------|-------|------|-------|---|
| M1 | Channel Sender + approval-to-send | 7 | 7 | 100% |
| M2 | n8n ↔ schema repair | 7 | 7 | 100% |
| M3 | Intake reliability | 5 | 5 | 100% |
| M4 | Reports + hygiene | 7 | 7 | 100% |
| **All** | | **26** | **26** | **100%** |

**All checklist code items are complete and merged into `development`.** What's left is not new
code, but closing external/deploy/live-activation gaps:

1. **Deploy `development` to production** (nexusos.knurdz.org) — several endpoints
   (`gmail-backfill`, live-hop send) 404 until this happens.
2. **`gmail.send` OAuth scope** — real Gmail sends are blocked on read-only scope; sandbox
   transport proves the pipeline in the meantime.
3. **`CHANNEL_SENDER_TRANSPORT=sandbox`** set on the deploy — needed for the live approval→send
   hop to go fully green without hitting real Gmail.
4. **n8n Variables** `NEXUS_APP_URL` / `NEXUS_INGEST_TOKEN` for WF0e (backfill poller) and WF0f
   (gmail-sync poller), plus **`OPENAI_API_KEY`** for WF2/WF5/WF8c (see 5.15) once credits land.
   After deploy: **activate WF0f `rNjW8GyWfZHuXnnf`** so new Gmail flows in continuously.
5. **2.6 tenant-unification bridge migration** — ADR written, implementation deliberately deferred
   pending human sign-off (teams/workspaces vs organizations/user_profiles).
6. **`main` branch is far behind `development`** (only through PR #115) — none of this checklist's
   work is on `main`. If production deploys from `main`, that's the actual blocker, not the code.
7. Minor open flags from Member 2's self-audit: WF2 silently drops unmatched-tenant messages; WF2
   uses a free-tier OpenRouter model instead of GPT-4o (needs a vendor decision); WF2→WF3 payload
   omits `workspace_id` (DB trigger backfills it).
8. Live n8n/Supabase activation state (which workflows are ACTIVE right now) was **not
   re-verified this pass** — this reconciliation checked code/migrations/tests/PR history only, per
   the last known state, WF0a/WF0d/WF0e/WF2/WF5/approval-trigger are active; WF1/WF3/WF4 are
   reported inactive by design (WF3 pending `gmail.send`).

---

## Progress log (append one line per completed item: date · member · item · note)

<!-- e.g. 2026-07-12 · M2 · 2.2 · WF0a now targets knurdz3o /nexus/classify; mahinsacw confirmed stale -->
2026-07-14 · hardening · §5 release-hardening pass (deep scan). ROOT CAUSES of empty dashboard found+fixed: (1) WF2 Parse read the ai-usage response not the LLM output (exec 68758 proof) — fixed live+published v567a5138; (2) business_profiles had NO unique(team_id) so the callback upsert failed silently every connect — migration 20260714200000 applied live; (3) no continuous intake existed (WF0a IMAP node disabled) — new gmail-sync endpoint + WF0f rNjW8GyWfZHuXnnf (INACTIVE until deploy); (4) founder tenant ce71d8cf seeded (profile row + 60-day backfill job); (5) ai_usage migration applied live. OpenAI swap: WF2→gpt-4o, WF8c→gpt-4o-mini+gpt-image-1 (published v42e603f2), WF5 GPT summary restored w/ template fallback (published v59403f3a) — all read $vars.OPENAI_API_KEY (Variable NOT set yet — NEEDS HUMAN). OAuth signup fixed for Safari/Chrome (HMAC state, cookie-less callback, error codes surfaced, status polling). Settings PATCH + meta callback ternary + eslint-in-builds fixed. lint+build+tests green (gmail-oauth-state 9/9, gmail-callback, gmail-sync 6/6, wf2-contract 5/5, tenant-intake, gmail-backfill).
2026-07-14 · reconciliation · Re-grounded this file's checkbox state against `origin/development`
  code (git ls-tree, migration files, `package.json` test scripts) and GitHub PR/commit history
  (`gh pr list`), per explicit request to verify from code/PRs/commits rather than trust prior
  checklist text. Found M1 (1.1–1.7) and M2 (2.1–2.7) were complete in code but showed unchecked
  here because Member 3 re-added this file to `development` from a stale template
  (commit `5e6d85b`) that predated the M1/M2 completion. Corrected all 26 checkboxes; merged the
  M1/M2 detail log lines below (previously only present in the `workflow-update1.1` branch's copy
  of this file) so all four members' history lives in one place. Also confirmed PR #122 (Member 3)
  is merged, so checked that box in the "Open follow-ups" section. Did not re-verify live
  n8n/Supabase runtime state (activation flags, `main` branch is still far behind `development`) —
  see "Overall build progress" for what's left.
2026-07-13 · M1 · 1.7 · Meta outbound GROUNDWORK (live sending DISABLED, per spec). New docs/meta_outbound.md (24h customer-service window + WhatsApp template fallback + Messenger/IG HUMAN_AGENT 7d tag + delivery/read-receipt contract + how it plugs into the SAME approval-gated executeSendReply via channel dispatch). New lib/meta/window.ts = single source of truth for window math (withinServiceWindow, chooseSendStrategy → session_text|template|human_agent_tag|blocked; fail-closed on unknown inbound). New lib/meta/send.ts = buildMetaSendRequest (exact Graph v21 request shapes per platform/strategy) + sendMetaMessage() which THROWS 501 (no code path can deliver Meta yet). New scripts/meta_window.test.ts (test:meta-window) 20/20 green. lint+build pass; regression approval-policy/send-reply/autopilot-send still 11/9/9. No migration, no live wiring, no n8n change. Follow-up-to-enable checklist in the doc §6.
2026-07-13 · M1 · 1.6c · LIVE hop chain PROVEN CONNECTED, final send SKIPPED per user. Added n8n Variable `N8N_INGEST_TOKEN` → re-ran scripts/e2e_live_hop.ts: webhook→n8n→deployed executor now succeeds end-to-end (n8n 200, executor reached). Executor returned `{success:false,error:"Failed to send reply"}` from channel-sender.ts:185 — i.e. it got PAST credential decrypt (line 162), so ENCRYPTION_KEY matches on the deploy AND auth/$vars wiring is correct; it then attempted a REAL Gmail call because the deploy lacks `CHANNEL_SENDER_TRANSPORT=sandbox`. ONLY remaining step to turn the live hop fully green: set `CHANNEL_SENDER_TRANSPORT=sandbox` on the Netlify deploy + redeploy, then re-run scripts/e2e_live_hop.ts. User chose to SKIP this and move to 1.7. Fixture torn down cleanly. Phase A (test:send-e2e) remains 5/5 green, so the sender is proven regardless.
2026-07-12 · M1 · 1.6b · LIVE hop gotcha found + fixed: **n8n Cloud blocks `$env` in node expressions** (N8N_BLOCK_ENV_ACCESS_IN_NODE) → the approval-trigger AND WF3 autopilot HTTP nodes failed with "access to env vars denied". Fixed both live nodes + repo exports + docs to hardcode the app URL (https://nexusos.knurdz.org) and read the token via `{{ $vars.N8N_INGEST_TOKEN }}`. REMAINING manual step: add an n8n **Variable** `N8N_INGEST_TOKEN` (Settings → Variables, value = app's ingest token) — env vars won't work. App deploy verified live (send-reply/autopilot-send return 401 = routes+token present). approval-trigger PtfTN2YTN8bmHzDu is ACTIVE. After the Variable is set, re-run scripts/e2e_live_hop.ts.
2026-07-12 · M1 · 1.6 · End-to-end proof. Added env-gated sandbox transport (CHANNEL_SENDER_TRANSPORT=sandbox in lib/gmail/send.ts; OFF by default, MUST be off in prod). New scripts/send_e2e.integration.ts (test:send-e2e) runs against LIVE Supabase with an isolated marked test tenant + sandbox transport: proves executeSendReply send+status transitions, idempotency (no double-send), autopilot auto-send + churn-gating, AND the 2.4 triggers filling team_id/workspace_id — 5/5 checks, teardown clean (verified 0 leftovers). lint+build+regression green. Created the app→n8n→executor approval-trigger workflow LIVE in knurdz3o (id PtfTN2YTN8bmHzDu, INACTIVE). REMAINING (deploy-gated, handed off): deploy this branch to nexusos.knurdz.org (so /api/internal/n8n/send-reply is live), set app env N8N_WEBHOOK_BASE_URL=https://knurdz3o.app.n8n.cloud + CHANNEL_SENDER_TRANSPORT=sandbox + N8N_INGEST_TOKEN, set n8n env NEXUS_APP_BASE_URL=https://nexusos.knurdz.org + N8N_INGEST_TOKEN, activate PtfTN2YTN8bmHzDu, then POST /webhook/approval-trigger with a seeded approved draft to prove the full chain (idempotent). Real Gmail send still needs gmail.send scope.
2026-07-13 · M2 · fix b+d · Git forensics first: schedule_followup only ever existed in the NEW WF2 (commit f4b991c) — the workflow_logs removal (3ad6ffb, 2026-07-09) did NOT cause flag (b); it was a wiring gap in the rebuilt WF2 (prompt offers 4 actions, only 3 routed). LIVE WF2 edited + PUBLISHED (v73836b83): Route-by-Action false → new "Is Schedule Followup" IF → true: "Create Followup" (POST followups, team_id+workspace_id stamped, status pending so WF4 sweeps it, 48h like WF3) / false: "Log Unhandled Action" (workflow_logs, neverError); Check-Classification-Success error branch → new "Log Classification Error" (workflow_logs, neverError). Pin-data execution 68607 proves the schedule_followup route reaches Create Followup (WF3 + unhandled-log NOT run). Repo export re-synced; test:wf2-contract extended to 4 checks (branch wiring + live followups insert matching the node body) — 4/4 green. ALSO restored WF0a's 3 log-node builders + connections in build_n8n_workflow_exports.js (stripped by 3ad6ffb but still present in LIVE WF0a) and regenerated wf0a_gmail_intake.json — verified node-body + connection parity vs live. NO UI restored (per decision: /logs page, api/logs, internal workflow-logs endpoint, approval/webhook app-side logging all stay removed; n8n logs go direct to Supabase REST). ⚠️ NEW FLAG (f): WF0a (live + export) uses `$env.NEXUS_WORKSPACE_ID` in log + POST-Conversation node expressions — n8n Cloud BLOCKS $env in expressions (same failure M1 hit in 1.6b); must be swapped to $vars/null before WF0a activation (live edit was permission-gated this session — needs human/Member-2 action). **Update 2026-07-14: code-verified fixed** — `getEnv()` guarded helper now wraps this access in `wf0a_gmail_intake.json`.
2026-07-13 · M2 · audit · Independent verification of commit f4b991c (all M2 items): repo wf2_classification.json matches LIVE WF2 MmA7EKsOYAZgx3ep node-for-node (ACTIVE, correct IF wiring — error branch fail-stops, success proceeds); restore_workflow_logs applied remotely as version 20260713100344 (⚠️ local file says 20260713160000 — timestamp drift, fold into 3.1); test:wf2-contract 2/2 green. FLAGS for follow-up: (a) WF2 silently drops messages for tenants with NO business_profiles row (empty fetch → zero items → branch halts; webhook already 200'd, WF1 neverError → no retry, no log); (b) ~~recommended_action='schedule_followup' hits Route-by-Action false branch which dangles~~ **FIXED 2026-07-13, see below**; (c) WF2 classifies via OpenRouter `nvidia/nemotron-3-ultra-550b-a55b:free`, not GPT-4o as CLAUDE.md/architecture state — free-tier rate limits + prompt-training exposure for customer messages; needs human decision; (d) ~~WF2 error path doesn't log to the freshly restored workflow_logs~~ **FIXED 2026-07-13, see below**; (e) WF2→WF3 payload omits workspace_id (WF1→WF2 passes it) — DB trigger backfills, but inconsistent.
2026-07-12 · M2 · 2.4 · VERIFIED live: reply_drafts/followups.team_id NOT NULL but BEFORE-INSERT triggers auto-fill team_id/workspace_id from the parent conversation, so WF3/WF4 inserts do NOT 400 (stamping added anyway as defensive/self-doc). WF1 was the real crash: service-role conversations insert with no auth.uid() → conversations_set_team_from_profile raises. Fixed WF1 live: added Require Tenant gate (400 if no team_id/workspace_id) + Normalize + Insert now stamp team_id/workspace_id. WF3/WF4 draft+followup inserts stamped. All 3 edited live via n8n MCP (kept INACTIVE) + snapshotted to n8n_logic/exports/{wf1,wf3,wf4}*.json (+README). Not touching WF0a(2.2)/WF2(2.3).
2026-07-13 · M4 · 4.7 · Chose gitignore (regenerable artifact). `/graphify-out/` already in .gitignore since c2dba10; not tracked; dir absent on disk. Human deferred to best option.
2026-07-13 · M4 · 4.6 · Inventoried 15 git-tracked iCloud " 2" paths + empty New Text Document.txt (paths/metadata only; none opened/deleted). See §4.6 inventory.
2026-07-13 · M4 · 4.5 · Archived orphan WF8a Claude YjEXyYnAHhoSSc2W (isArchived true); app wired to active WF8a dTunsN6JW5P1nymB /social-post-input. Contracts: WF8a response array-vs-object mismatch; WF8c match; WF8b no app caller (publish-social-post). 9 workflows active (audit stale).
2026-07-13 · M4 · 4.4 · ai_usage table + /api/internal/n8n/ai-usage; WF2 MmA7EKsOYAZgx3ep + WF3 OjFlX2W2xYbl5roY emit usage (Record AI Usage nodes); WF5 deferred (template summary, no OpenAI usage). WF2 pinned exec 68758: usage node success, tokens 342/94 from OpenRouter; DB row blocked until migration + deploy.
2026-07-13 · M4 · 4.3 · social_credentials row count 0 verified live; migration 20260713180000 adds access_token_encrypted+refresh_token_encrypted; writers: none (lib/social/credentials.ts helper added); readers: WF8b VZ9ZaA1S2JxSAeGQ → GET /api/internal/n8n/social-credentials (active).
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
