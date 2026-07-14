# Nexus OS — Rebuild Context & Build State

Companion to `/CLAUDE.md`. This file tells you **where the build is now**, **the target
architecture**, and **the order of work**. Last grounded against the repo: 2026-06-24.

---

## 1. Target architecture (corrected)

The product has three logical units. Each box below is named by what it actually does.

### Core pipeline (deterministic functions + one approval gate)
```
Gmail (live) ─┐
Meta  (next) ─┴─▶ Fetch & Normalize ─▶ Noise Filter ─▶ [conversations]
                 ─▶ Classify (intent·value·churn) ─▶ [leads]
                 ─▶ Draft Reply (GPT-4o + retrieval) ─▶ [reply_drafts]
                 ─▶ Approval Gate (policy: auto low-risk · gate high-stakes)
                 ─▶ Channel Sender (per-platform) ─▶ Customer
```
- On Gmail/Meta connect, run a **60–90 day historical backfill** so the dashboard is never empty.

### Knowledge & insight
- **One `pgvector` store inside Supabase.** Table `embeddings`, tagged by `kind`:
  `business_doc` (founder uploads), `conversation`, `summary`. Switch a kind on only when a
  feature reads it. Business docs first; conversations only when "similar past cases" retrieval is
  built into Draft Reply.
- **Periodic Summary** (daily/weekly/monthly) writes to `daily_reports`.
- **Chat Agent** — the only true agent. READ-ONLY: retrieves from pgvector + `leads` + reports and
  answers the founder. It may *suggest* actions, but suggestions go INTO the approval queue; it
  never sends anything itself.

### Media studio — DEFERRED (Phase 5+)
Upload media or prompt→image-gen → hidden prompt enhancer → per-platform caption (few-shot, NOT
fine-tuned) → user edit → **approval** → multi-platform publisher. Do not start until the core
pipeline + Chat Agent are proven.

### Cross-cutting (applies to everything)
Tenant isolation (RLS) · `workflow_logs` observability · durable idempotency (`platform + message_id`) · AI cost tracking.

---

## 2. Current build state (grounded in code)

### Done / working
- Gmail OAuth + IMAP intake (`app/api/gmail/*`). *(Human is re-doing Google auth on the production
  domain — leave Gmail source wiring alone unless asked.)*
- Classification (WF2), reply drafting (WF3), buy-back report (WF4) as n8n Code-node logic.
- Approval flow (`app/api/approval/route.ts`, `/approval` page).
- Multi-tenant model: `teams → workspaces → profiles → business_profiles`, RLS helpers
  (`private.current_team_id()`, `public.is_workspace_owner()`).
- Internal n8n ingest endpoints (`app/api/internal/n8n/*`) with `N8N_INGEST_TOKEN`.
- Design tokens + 5 hand-built UI components (`components/ui/`). shadcn is configured in
  `components.json` but NOT installed (no Radix / CVA in package.json).

### Half-built — Meta unified inbox (≈70%)
Built:
- Migration `20260619120000_meta_unified_inbox_foundation.sql`:
  - `conversations.source` extended with `whatsapp` / `instagram` / `facebook`.
  - `conversations.external_thread_id`, `external_permalink` columns + index.
  - `business_profiles` routing keys `wa_phone_number_id`, `ig_account_id`, `fb_page_id` (unique).
  - `meta_credentials` table (encrypted token, platform, status, sync flags) with RLS + triggers.
- `app/api/meta/webhook/route.ts`: GET hub-challenge verify ✓, POST `X-Hub-Signature-256` verify ✓,
  message-id extraction for WhatsApp (`entry[].changes[].value.messages[]`) and Messenger/IG
  (`entry[].messaging[].message.mid`) ✓.
- OAuth: `app/api/meta/connect`, `/callback`, `/status`, `helpers.ts` (scopes, state encode/decode,
  graph URL). `lib/meta-deep-links.ts`. `app/api/internal/n8n/meta-credentials/route.ts`.
- `n8n_logic/multi_channel_normalizer.js`, `tenant_route_resolver.js`.

**NOT done / known weak spots (these are the next work):**
1. **Dedup is an in-memory `Map`** in the webhook → lost on serverless cold start, not shared
   across instances. Needs a durable idempotency table keyed on `platform + message_id`.
2. **n8n forward is fire-and-forget** (`void forwardToN8n(...)`) → if n8n is down, the message is
   silently dropped. Needs **persist-before-ack**: write the raw event to a durable inbound table,
   return 200, then process.
3. **Tenant routing not verified end-to-end** from a real Meta payload through
   `tenant_route_resolver.js` into a `conversations` row with correct `team_id`/`workspace_id`.
4. **Deep links unverified** — WhatsApp must link to the *customer* number, not the business
   number; IG/FB message ids are not always thread ids.
5. **No outbound Meta sending** (Phase 2): 24-hour window rules, WhatsApp template fallback.

### Deferred (do not start yet)
Social publishing studio, AI image generation, hiring/ATS section. See
`docs/full_new_implementation_blueprint.md`.

---

## 3. Key tables (grep migrations to confirm columns; do not assume)

- `conversations` — inbound messages. `source`, `external_thread_id`, `external_permalink`,
  classification columns (added in 0002/0003).
- `leads` — classification output: intent, urgency, `estimated_value`, `risk_score`.
- `reply_drafts` — approval-gated drafts (status `pending_approval` etc.).
- `business_profiles` — tone/services/approval mode + routing keys (gmail destination, wa/ig/fb).
- `meta_credentials` / `gmail_credentials` — encrypted per-workspace tokens.
- `workflow_logs` — step audit trail.
- `daily_reports` — aggregated hours saved / revenue rescued.

---

## 4. Build order (functions track — owned by Senuka)

UI and pricing are owned by other members; this track is backend/functions.

1. **Reliability foundation:** durable inbound ingestion + idempotency (replaces in-memory dedup
   and fire-and-forget forward). Channel-agnostic — serves Gmail + Meta. ← FIRST
2. **Meta inbound end-to-end:** verified tenant routing + normalizer → `conversations`; correct
   deep links; parser tests for WA/IG/FB payloads.
3. **Historical backfill on connect** (Gmail first), so dashboards show real numbers immediately.
4. **Knowledge layer:** `pgvector` `embeddings` table + business-doc ingestion; periodic summaries.
5. **Chat Agent** (read-only, retrieval over docs + leads + reports; suggestions → approval queue).
6. **Meta outbound** (approval-gated, messaging-window rules).
7. Then deferred phases (media studio, image gen, hiring) + production reliability (durable queues,
   cost tracking, replay tooling).

Each step ships behind the existing safety model (RLS, approval gate, encrypted tokens) and ends
with the report-back block from `CLAUDE.md`.

---

## 5. Decisions & known deferrals (do not re-litigate without reason)

- **Task 1 shipped (2026-06-24):** durable `inbound_events` ledger + idempotency
  (`20260620120000_inbound_events_idempotency.sql`), persist-before-ack webhook, reusable
  `lib/inbound-events.ts`. Migration must be applied in Supabase; runtime needs
  `SUPABASE_SERVICE_ROLE_KEY` or the webhook fail-safes to 503.
- **Delivery/read receipts** (Meta `statuses` / read events) are intentionally NOT forwarded today
  (returned `200 {ignored}`). They are NOT inbound customer messages. **MUST be handled in the Meta
  OUTBOUND task** to update `conversations.status` / `reply_drafts` (delivered/read). Don't forget.
- **No retry/replay sweep yet.** Webhook returns 200 after persist, so Meta will NOT redeliver a
  failed n8n forward. Events stuck at `received`/`failed` in `inbound_events` are durable but not
  reprocessed. A cron/worker draining them is **required before production launch** (not beta).
- **n8n inbound path** is `${N8N_WEBHOOK_BASE_URL}/webhook/gmail-inbound` for ALL channels
  (disambiguated by `x-nexus-channel` header). Rename to a channel-neutral path when n8n is touched.
- **Tenant resolution location:** resolve at the EDGE (Next.js webhook), not in n8n — so the
  `inbound_events` ledger is tenant-stamped at write time and routing lives in one typed place.
  (Adopted in Task 2.)
- **Task 2 shipped (2026-06-24):** edge tenant resolution (`lib/meta-tenant.ts`), ledger stamping,
  normalizer canonical fields + customer-number WhatsApp permalink, IG/FB return null (graceful
  "unavailable") instead of wrong links. Tested via sanitized WA/IG/FB fixtures. Real routing-key
  fields to be confirmed against live payloads once Meta App Review clears.
- **Knowledge layer NOW BUILT (2026-07-14).** Business-document upload — the agreed trigger for
  building the vector store — shipped, so the `embeddings`/pgvector layer is live. Migration
  `20260715120000_knowledge_layer_pgvector.sql` adds the `vector` extension, a single `embeddings`
  table tagged by `kind` (`business_doc` | `conversation` | `summary`), a `business_documents`
  metadata table, the `match_embeddings` cosine-search RPC, and a private `business-docs` storage
  bucket. The **Chat Agent** now retrieves relevant chunks (`lib/embeddings/store.ts` →
  `buildAnalystContext` → `buildAnalystSystemPrompt`) in addition to the structured snapshot;
  founders manage docs + an editable analyst persona in Settings → AI & Approval Rules. Ingestion
  is via `POST /api/business-docs` (extract → chunk → embed); chat/inbox summaries are embedded
  best-effort. It still answers ONLY from the snapshot + knowledge base (read-only, no fabrication).
- **Both Gmail and Meta are domain-blocked for live use** (production domain not finalized; Meta
  also needs App Review). So `conversations`/`leads` may be empty in dev — the Chat Agent task
  includes a demo-seed script so it can be built and demoed before live intake exists.
