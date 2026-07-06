# CLAUDE.md — Nexus OS Engineering Guide

> Read this file first, every session. Then read `docs/NEXUS_REBUILD_CONTEXT.md` for current
> build state and the architecture you are building toward. Do not start coding until you have
> read both.

## What Nexus OS is

An AI "Revenue Command Center" for founders and small teams. It ingests inbound customer
messages (Gmail today; WhatsApp / Instagram / Facebook next), filters noise, classifies each
message with GPT-4o (intent, urgency, estimated value, churn risk), drafts a reply, and routes
high-stakes replies through a founder approval queue before anything is sent. Multi-tenant SaaS
on Next.js 14 (App Router) + Supabase (Postgres + RLS) + n8n + OpenAI.

## Non-negotiable architecture principles

These override habit. If a request conflicts with one of these, STOP and ask.

1. **Functions over "agents."** Fetch, noise-filter, classify, draft, and send are deterministic
   steps — plain functions or single LLM calls. Do NOT build agent loops, tool routers, or
   orchestration for them. The ONLY real agent in this system is the read-only Chat Agent.
2. **One vector store, and it lives in Supabase.** Use `pgvector` inside the existing Postgres —
   never add a separate vector database (Pinecone, Weaviate, etc.). One `embeddings` table tagged
   by `kind` (`business_doc` | `conversation` | `summary`). Do not embed a kind until there is a
   concrete feature that reads it.
3. **All outbound is approval-gated by policy.** Every reply or post passes through the approval
   layer. Policy decides: auto-send low-risk/low-value, hard-gate high-value or churn-risk. Never
   send or publish anything directly from a classifier, drafter, or the Chat Agent.
4. **No fine-tuning.** Use system prompts + few-shot examples + retrieval. Fine-tuning is
   explicitly deferred until there is labelled data and a measured quality ceiling. If you think a
   task "needs" a fine-tune, it doesn't yet — improve the prompt.
5. **Migrations are additive and numbered.** Never rewrite or destructively alter an existing
   migration. Add a new sequentially-named file under `supabase/migrations/`. New tables get RLS
   from day one.
6. **Tenant isolation everywhere.** Every row carries `team_id` / `workspace_id`. Every API
   mutation calls `requireApiTenantContext()` (see `lib/api-security.ts`). Every new table enables
   RLS scoped to the tenant.

## ⚠️ Repo hazard — duplicate files from iCloud sync

This repo is iCloud-synced and contains conflicted duplicates named `* 2.ext`
(e.g. `n8n_logic/noise_filter 2.js`, `tailwind.config 2.ts`, `next.config 2.mjs`).

- **NEVER read, edit, or import a file whose name contains " 2" before the extension.** They are
  stale copies. The canonical file is the one WITHOUT " 2".
- If you find logic only in a ` 2` file, treat it as suspect and flag it in your report — do not
  silently adopt it.
- If asked to clean the repo, list the ` 2` files for the human to delete; do not delete them
  yourself unless explicitly told to.

## Repo map (canonical locations)

```
app/
  api/
    gmail/        OAuth + IMAP intake for Gmail
    meta/         Meta (WhatsApp/IG/FB) webhook, OAuth connect/callback/status, helpers
    internal/n8n/ token-auth ingest endpoints called BY n8n (conversations, workflow-logs, *-credentials)
    approval/     approve/reject/edit a reply draft
    conversations/ leads/ reply-drafts/ metrics/ report/  read + ingest REST
  dashboard/ inbox/ approval/ logs/ report/   authenticated UI pages
  signup/ onboarding/ login/                  tenant onboarding
lib/
  api-security.ts     requireApiTenantContext(), rateLimit()
  encryption/         AES-256 token storage (ENCRYPTION_KEY)
  supabase/ supabase.ts  server + browser clients
  queries/ fetchers.ts   React Query data layer
  meta-deep-links.ts  native-inbox URL builders
n8n_logic/
  multi_channel_normalizer.js  canonical message shape (ALL channels normalize here)
  noise_filter.js              zero-cost spam/noise pre-filter (runs BEFORE any paid AI)
  tenant_route_resolver.js     resolve tenant from webhook payload -> business_profiles
  workflow_2_classification.js / workflow_3_agent.js / workflow_4_buy_back_report.js
  deduplication_lookup.js
  exports/                     importable n8n JSON
supabase/migrations/   schema + RLS (source of truth for the data model)
ai_prompts/            classification_prompt.txt, reply_generation_prompt.txt
scripts/               tests + n8n export builder
docs/                  context, env, test results  ← read these when you need more detail
```

## Where to look when you need more context

- **Build state + architecture:** `docs/NEXUS_REBUILD_CONTEXT.md`
- **Full feature blueprint (broad, multi-phase):** `docs/full_new_implementation_blueprint.md`
- **Meta inbox plan:** `docs/meta_unified_inbox.md`, `docs/gmail_new_implementation.md`
- **n8n env vars:** `docs/n8n_workspace_env.md`
- **Data model:** read the latest relevant file in `supabase/migrations/` — do not assume columns,
  grep for them.

If something you need is not documented, STOP and ask the human rather than inventing it.

## Conventions

- TypeScript strict mode; import alias `@/*`.
- API routes: tenant mutations go through `requireApiTenantContext()`; add `rateLimit()` to public
  and authenticated routes.
- n8n Code nodes: keep the body copy-pasteable from the `// --- n8n entrypoint ---` section; never
  hard-code secrets; read config from env.
- Secrets: `SUPABASE_SERVICE_ROLE_KEY` and `ENCRYPTION_KEY` are server-only — never in a
  `NEXT_PUBLIC_*` var or the client bundle. Third-party tokens are AES-encrypted before storage.
- Webhooks: always verify signatures (e.g. Meta `X-Hub-Signature-256`) before trusting a payload.

## Verify before you call it done

Run and report results:

```bash
npm run lint
npm run build
npm run test:tenant-intake
npm run n8n:export-workflows   # only if you touched n8n_logic
```

Add focused tests for new logic (normalizer output, tenant resolution, idempotency, signature
verification). Do not mark a task complete if lint, build, or tests fail.

## How to report back (every task)

End each task with this block so the human can paste it back for the next prompt:

```
## DONE
- <one line per change, with file path>

## FILES CHANGED
- <path> — <why>

## MIGRATIONS ADDED
- <filename or "none">

## VERIFICATION
- lint: pass/fail
- build: pass/fail
- tests run + results

## NEEDS HUMAN
- env vars to set, Supabase migration to apply, n8n import, or decisions

## OPEN QUESTIONS / RISKS
- <anything you assumed or could not verify>
```
