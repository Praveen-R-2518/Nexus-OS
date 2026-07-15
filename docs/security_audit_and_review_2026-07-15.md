# Nexus OS — Launch-Readiness Report (2026-07-15)

Scope: `app/` · `lib/` · `supabase/migrations` · `n8n_logic`, cross-checked against live Supabase
security advisors and the code graph. Branch: `vector-db-integration`.

A shareable version of this report is published as a private Claude artifact:
<https://claude.ai/code/artifact/09a7d38b-c195-4eb1-889a-fe35900bba92>

> **Keep this report private** until the two launch blockers are remediated — it enumerates
> exploitable weaknesses.

---

## Verdict: CONDITIONAL GO

Launch the **email + analyst features to a limited cohort now; gate the social/publishing layer**
until two database-policy blockers are fixed.

- The **core is sound**: RLS is enabled on all 28 public tables, secrets are handled correctly,
  third-party tokens are AES-256-GCM encrypted, and the RAG retrieval path is tenant-safe.
- This pass **hardened the app layer directly** — constant-time token checks, closed a rate-limit
  bypass, and signed the previously-forgeable Meta OAuth state.
- **Two blockers remain, both in the DB policy layer of the newer social/organization module**: an
  unrestricted INSERT policy on `organizations`, and a single shared token that exposes every
  tenant's mailbox credentials.

---

## A. Security audit

### Fixed in this pass (app code — verified by lint, build, and OAuth-state tests)

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| 1 | High | n8n bearer token compared with `!==` (timing side-channel on the one secret guarding all tenants' mailbox tokens) | `lib/api-security.ts` `requireN8nToken()` | Length-guarded `crypto.timingSafeEqual` via new exported `constantTimeEqual` |
| 2 | High | `rateLimit()` returned `null` (no limiting) when IP headers absent → limiter removable by stripping headers | `lib/api-security.ts` `rateLimit()` | Sensitive namespaces (`api:internal:*`, `api:auth:*`) fall back to a shared `__noip__` bucket |
| 3 | Medium | Meta OAuth `state` was plain base64url JSON — unsigned, forgeable, no CSRF binding | `app/api/meta/helpers.ts` | HMAC-SHA256 signed (domain-separated `meta-oauth-state` key) + issued-at + 10-min expiry + `timingSafeEqual`; `metaConfigError()` now requires `ENCRYPTION_KEY`; added `scripts/meta_oauth_state.test.ts` (10/10) |
| 4 | Low | Meta webhook GET verify-token used `===` | `app/api/meta/webhook/route.ts` | Constant-time compare |
| 5 | Low | No way to scope credential polling to one tenant | both `internal/n8n/*-credentials/route.ts` | Added optional `?workspace_id=` filter (bulk stays default — non-breaking, enables least-privilege polling) |

### Reported — recommended, NOT changed (database / architecture)

These were left untouched by design: they change the divergent org-tenancy model or DB objects and
need deliberate decisions + additive migrations rather than a silent rewrite (per the project's
migration rules).

| # | Severity | Finding | Remediation |
|---|----------|---------|-------------|
| 6 | **Critical (blocker)** | Advisor `rls_policy_always_true`: policy `org_insert` on `public.organizations` is `WITH CHECK (true)` — unrestricted INSERT into the social layer's tenant root | New migration replacing `WITH CHECK (true)` with an owner/`auth.uid()`-scoped check |
| 7 | **High (blocker)** | One shared `N8N_INGEST_TOKEN` returns **all** tenants' decrypted Gmail/Meta tokens and can send as any caller-supplied `team_id` (`send-reply`/`autopilot-send`) — total blast radius | Adopt the new per-`workspace_id` scoping in the n8n poll; IP allowlist for n8n egress; short-lived/rotated tokens or mTLS |
| 8 | Med–High | Advisor `function_search_path_mutable` on `get_user_team_id`, `get_user_organization_id`, `match_embeddings`, and trigger fns — DEFINER functions used in RLS with unpinned `search_path` | `ALTER FUNCTION … SET search_path = ''` for every DEFINER function |
| 9 | Medium | Advisors 0028/0029: DEFINER helpers + `trg_*` triggers callable by anon/authenticated at `/rest/v1/rpc/*` (incl. `rls_auto_enable`) | `REVOKE EXECUTE … FROM anon, authenticated` except intentional ones (e.g. `invite_preview`) |
| 10 | Medium | Rate limiter is an in-memory `globalThis` Map — resets on redeploy, per-instance | Back with Upstash Ratelimit or Postgres/Redis |
| 11 | Low | Gmail callback service-role fallback (Safari ITP) is powerful; `vector` extension in `public`; leaked-password protection disabled | Add logging/limit on the fallback path; move extension to its own schema; enable HaveIBeenPwned check |

> Note: `gmail_backfill_jobs` & `inbound_events` show "RLS enabled, no policy" — **intentional**
> (service-role-only, deny-by-default). Not a vulnerability.

### What's already right

- RLS on all 28 public tables; no `USING(true)` read-all on core tenant data.
- Meta webhook verifies `X-Hub-Signature-256` with a constant-time HMAC check.
- Secrets gitignored & untracked; service-role key and `ENCRYPTION_KEY` never reach the client bundle.
- Third-party tokens: AES-256-GCM with a per-record random IV.
- `match_embeddings` is SECURITY INVOKER + team-filtered — RAG retrieval cannot cross tenants.
- Tenant mutations route through `requireApiTenantContext()`; JSON bodies are size-capped.

---

## B. Vector DB & RAG pipeline

Each tenant's own documents and messages become searchable vectors inside Supabase, and a read-only
"Revenue Analyst" chatbot answers questions grounded strictly in that tenant's data.

**Source → Parse → Chunk → Embed → Store → Retrieve → Generate**

1. **Source** — uploaded PDF/TXT/MD, inbound customer messages, and chat summaries; each tagged
   `kind` = `business_doc | conversation | summary`.
2. **Parse** — `pdf-parse` for PDFs, UTF-8 for text (`lib/documents/extract.ts`); 5 MB cap, private
   per-team storage bucket.
3. **Chunk** — ~1500 chars / 200 overlap, splitting on paragraph → sentence → word
   (`lib/embeddings/store.ts`).
4. **Embed** — OpenAI `text-embedding-3-small` (1536-d), batched (`lib/embeddings/openai.ts`).
5. **Store** — one `embeddings` table (pgvector), HNSW cosine index, `team_id` auto-stamped by
   trigger, RLS team-scoped (`supabase/migrations/…knowledge_layer_pgvector.sql`).
6. **Retrieve** — `matchKnowledge` → `match_embeddings` RPC: cosine, top-k = 6, filtered by team +
   kind (SECURITY INVOKER).
7. **Generate** — GPT-4o streamed (`app/api/chat/route.ts`, `lib/chat/*`); retrieved chunks + a live
   read-only tenant snapshot go into a guard-railed prompt (editable persona + fixed rules: answer
   only from context, never claim to act). A rolling summary is embedded back after each turn.

**Honest gaps:** no similarity threshold (weak matches can surface on sparse tenants); reply-drafting
(WF3) doesn't retrieve yet — "similar past cases" is planned; whole doc embedded in a single batch.

---

## C. Project review

**Final purpose.** An AI **Revenue Command Center**: watch a founder's inbound customer channels,
filter noise for free, classify each message with GPT-4o (intent, urgency, value, churn risk), draft
an on-brand reply, and route anything high-stakes through a **founder approval queue** before it
sends — so revenue and relationships never slip through a missed message. A knowledge layer, a
read-only analyst, and a daily "buy-back" ROI report sit on top. Stack: Next.js 14 + Supabase
(Postgres + RLS) + n8n + OpenAI.

**Build state**

- **Shipping:** Gmail OAuth+IMAP intake; noise filter → classify → draft (WF2/WF3); approval queue +
  send; multi-tenant model + RLS; knowledge layer + RAG analyst; durable inbound-events ledger;
  daily buy-back report.
- **In progress (~70%):** Meta unified inbox (WhatsApp/IG/FB) — webhook/OAuth/normalizer built;
  outbound send, deep-links, and dedup/tenant-routing hardening pending.
- **Planned:** Meta/WhatsApp outbound; social publishing studio + adapters; AI image generation;
  hiring/ATS; durable queues, rate limiting, observability.

**Issues & improvements**

1. **Reconcile the two tenancy models** before the social layer ships — core uses `teams`/`team_id`,
   social uses `organizations`/`organization_id` + `user_profiles`. Two parallel roots produced the
   permissive `organizations` INSERT policy (#6). Unify or firewall explicitly.
2. **Raise RAG retrieval quality** — similarity threshold, per-kind weighting, founder-visible
   citations, and wire retrieval into WF3 drafting.
3. **Lock down client-trust webhooks** — `lib/posts/webhooks.ts` posts a client-supplied `orgId` to
   a hard-coded n8n URL; image gen ~$0.04/call → server-side auth + per-tenant cost guardrails.
4. **Invest in reliability early** — durable rate limiting/queues, structured logs + traces; build
   per-tenant usage/cost dashboards on the existing `ai_usage` table.

**New ideas**

- Approval-queue SLA + auto-escalation for high-value replies.
- Per-tenant AI budgets & alerts (OpenAI + image gen), on `ai_usage`.
- Inline retrieval citations in the analyst chat.
- Prompt-injection canary tests (customer text flows into the analyst prompt).
- Knowledge-health indicator + reindex job.
- Adaptive auto-send threshold from confidence × value × churn.

---

## D. Repo cleanup (done in this pass)

Removed 25 git-tracked junk files (15 iCloud `* 2.*` duplicates + empty/artifact files + 4
zero-reference scripts + unreferenced `public/Logo.svg`) and 4 untracked artifacts (`.DS_Store` ×3,
`tsconfig.tsbuildinfo`). Every ` 2` duplicate was diff-verified as identical to or an older subset
of its canonical counterpart — no unique logic lost. `package.json` script references all point to
kept canonical files; lint + build pass.
