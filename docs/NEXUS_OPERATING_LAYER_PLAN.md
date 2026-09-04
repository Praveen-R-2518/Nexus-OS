# Nexus OS — Operating Layer & People Intelligence

Canonical build plan. Grounded against the repository on **2026-09-01**.

Read this with `.cursor/rules/nexus.mdc`. If this file and the README disagree, **this file and the migrations win**.

Do not open a second “HR architecture” document. `docs/full_new_implementation_blueprint.md` was retired.

---

## Locked scope (do not ask)

This plan covers **Wave 1 People Intelligence only**.

| In scope | Out of scope |
|----------|----------------|
| Employees, jobs, candidates, CSV, deterministic matching, 4-stage pipeline, People email draft/send, read-only Chat snapshot | GitHub discovery, Nexus Router, five domain agents, Trigger.dev, leave/payroll/performance, CV PDF parse, OpenRouter, `organization_id` as People tenant, a second approval inbox, rewriting Revenue/Chat/n8n/Social |

Start at **A1**. One Cursor conversation = one partition. Do not implement Wave 2 (G2–L1) until every Wave 1 box below is `[x]`.

When a partition’s verify commands pass, the implementing agent **must** tick that row in this file (`[ ]` → `[x]`), fill **Done** (date + files), and save. Unticked = not done. Do not mark done if lint, build, or the partition tests failed.

---

## Build checklist

Copy the **next unticked** partition prompt from §12. Tick here only after verification.

### Wave 0 — already complete

- [x] **P0** Repository recon recorded in this file (tenant = `teams`/`workspaces`; AI = OpenAI via `lib/ai/*`; Chat = read-only). No extra recon conversation.

### Wave 1 — build in this order

Tick format: `- [x] **ID** Name — YYYY-MM-DD — key files`

- [x] **A1** Append-only audit log (`audit_events` + `lib/audit.ts` + RLS tests). Depends: none. — 2026-09-01 — `supabase/migrations/20260901120000_audit_events.sql`, `lib/audit.ts`, `scripts/audit.test.ts`
  Done: 2026-09-01 — `supabase/migrations/20260901120000_audit_events.sql`, `lib/audit.ts`, `scripts/audit.test.ts`

- [x] **A2** People schema + RLS (`employees`, `jobs`, `candidates`, `candidate_jobs`). Depends: none (can run same day as A1, not in the same conversation). — 2026-09-01 — `supabase/migrations/20260901130000_people_schema.sql`, `scripts/people_schema.test.ts`
  Done: 2026-09-01 — `supabase/migrations/20260901130000_people_schema.sql`, `scripts/people_schema.test.ts`

- [x] **B1** Employee service + API. Depends: A1, A2. — 2026-09-01 — `lib/people/employees.ts`, `app/api/people/employees/route.ts`, `app/api/people/employees/[id]/route.ts`, `scripts/people_employees_api.test.ts`
  Done: 2026-09-01 — `lib/people/employees.ts`, `app/api/people/employees/route.ts`, `app/api/people/employees/[id]/route.ts`, `scripts/people_employees_api.test.ts`

- [x] **B2** Employee UI + one `/people` nav item (do not change `/team`). Depends: B1. — 2026-09-01 — `app/people/page.tsx`, `components/people/*`, `lib/queries/fetchers.ts`, `components/layout/AppSidebar.tsx`
  Done: 2026-09-01 — `app/people/page.tsx`, `app/people/new/page.tsx`, `app/people/[id]/page.tsx`, `components/people/*`, `lib/queries/keys.ts`, `lib/queries/fetchers.ts`, `lib/queries/nav-prefetch.ts`, `components/layout/AppSidebar.tsx`, `middleware.ts`

- [x] **B3** Shared CSV parser (pure functions, employee + candidate field dictionaries). Depends: none. — 2026-09-02 — `lib/csv/parse.ts`, `lib/csv/profiles.ts`, `lib/csv/plan.ts`, `scripts/csv_engine.test.ts`
  Done: 2026-09-02 — `lib/csv/parse.ts`, `lib/csv/profiles.ts`, `lib/csv/plan.ts`, `lib/csv/index.ts`, `scripts/csv_engine.test.ts`

- [x] **B4** Employee CSV import/export (row-level errors, cap 500, no AI). Depends: B2, B3. — 2026-09-02 — `lib/people/employee-csv.ts`, `app/api/people/employees/import/route.ts`, `app/api/people/employees/export/route.ts`, `components/people/EmployeeCsvImport.tsx`
  Done: 2026-09-02 — `lib/csv/serialize.ts`, `lib/csv/plan.ts`, `lib/people/employee-csv.ts`, `lib/people/employees.ts`, `app/api/people/employees/import/route.ts`, `app/api/people/employees/import/preview/route.ts`, `app/api/people/employees/export/route.ts`, `components/people/EmployeeCsvImport.tsx`, `components/people/EmployeesList.tsx`, `lib/queries/fetchers.ts`, `scripts/people_employees_csv.test.ts`

- [x] **C1** Jobs API + create/edit UI (versioned scoring weights). Depends: A2. — 2026-09-02 — `lib/people/jobs.ts`, `lib/people/scoring-weights.ts`, `app/api/people/jobs/route.ts`, `app/api/people/jobs/[id]/route.ts`, `components/people/JobForm.tsx`
  Done: 2026-09-02 — `types/index.ts`, `lib/people/scoring-weights.ts`, `lib/people/jobs.ts`, `app/api/people/jobs/route.ts`, `app/api/people/jobs/[id]/route.ts`, `app/people/layout.tsx`, `app/people/jobs/page.tsx`, `app/people/jobs/new/page.tsx`, `app/people/jobs/[id]/page.tsx`, `components/people/PeopleSubnav.tsx`, `components/people/JobForm.tsx`, `components/people/JobsList.tsx`, `lib/queries/fetchers.ts`, `scripts/people_jobs_api.test.ts`

- [x] **C2** Candidate CRUD API + UI (no scores). Depends: A2. — 2026-09-02 — `lib/people/candidates.ts`, `app/api/people/candidates/route.ts`, `app/people/candidates/page.tsx`, `components/people/CandidateForm.tsx`
  Done: 2026-09-02 — `types/index.ts`, `lib/people/candidates.ts`, `app/api/people/candidates/route.ts`, `app/api/people/candidates/[id]/route.ts`, `app/people/candidates/page.tsx`, `app/people/candidates/new/page.tsx`, `app/people/candidates/[id]/page.tsx`, `components/people/CandidatesList.tsx`, `components/people/CandidateForm.tsx`, `components/people/CandidateCreate.tsx`, `components/people/CandidateDetail.tsx`, `components/people/PeopleSubnav.tsx`, `lib/queries/fetchers.ts`, `scripts/people_candidates_api.test.ts`

- [x] **C3** Candidate CSV import onto a selected job (stage `new`, no scores). Depends: B3, B4, C1, C2. — 2026-09-02 — `lib/people/candidate-csv.ts`, `lib/people/candidates.ts`, `app/api/people/candidates/import/route.ts`, `app/api/people/candidates/import/preview/route.ts`, `components/people/CandidateCsvImport.tsx`, `components/people/CandidatesList.tsx`, `components/people/JobDetail.tsx`, `lib/queries/fetchers.ts`, `scripts/people_candidates_csv.test.ts`
  Done: 2026-09-02 — `lib/people/candidate-csv.ts`, `lib/people/candidates.ts`, `app/api/people/candidates/import/route.ts`, `app/api/people/candidates/import/preview/route.ts`, `components/people/CandidateCsvImport.tsx`, `components/people/CandidatesList.tsx`, `components/people/JobDetail.tsx`, `lib/queries/fetchers.ts`, `scripts/people_candidates_csv.test.ts`

- [x] **D2** Deterministic scoring engine (pure, no LLM, no DB). Depends: none. May run in parallel with D1. — 2026-09-02 — `lib/people/score.ts`, `scripts/people_score.test.ts`
  Done: 2026-09-02 — `lib/people/score.ts`, `scripts/people_score.test.ts`, `package.json`

- [x] **D1** `background_jobs` table + match worker skeleton (no scoring yet). Depends: C3. — 2026-09-02 — `supabase/migrations/20260902140000_background_jobs.sql`, `lib/people/background-jobs.ts`, `app/api/internal/people/jobs/run/route.ts`, `lib/people/candidate-csv.ts`, `scripts/people_background_jobs.test.ts`
  Done: 2026-09-02 — `supabase/migrations/20260902140000_background_jobs.sql`, `lib/people/background-jobs.ts`, `app/api/internal/people/jobs/run/route.ts`, `lib/people/candidate-csv.ts`, `scripts/people_background_jobs.test.ts`, `scripts/people_candidates_csv.test.ts`, `package.json`

- [x] **D3** Wire D2 scoring into D1 worker. Depends: D1, D2. — 2026-09-02 — `lib/people/match-worker.ts`, `lib/people/background-jobs.ts`, `lib/people/jobs.ts`, `lib/audit.ts`, `supabase/migrations/20260902150000_candidate_jobs_scoring_version_text.sql`, `scripts/people_match_worker.test.ts`
  Done: 2026-09-02 — `lib/people/match-worker.ts`, `lib/people/background-jobs.ts`, `lib/people/jobs.ts`, `lib/audit.ts`, `app/api/internal/people/jobs/run/route.ts`, `supabase/migrations/20260902150000_candidate_jobs_scoring_version_text.sql`, `scripts/people_match_worker.test.ts`, `scripts/people_background_jobs.test.ts`, `scripts/audit.test.ts`, `types/index.ts`, `package.json`

- [x] **D4** AI explanation of already-computed scores (`lib/ai/*`, no score rewrite). Depends: D3. — 2026-09-02 — `lib/ai/people-explain.ts`, `ai_prompts/people_match_explanation_prompt.txt`, `lib/people/match-explanation.ts`, `lib/people/match-worker.ts`, `scripts/people_match_explain.test.ts`
  Done: 2026-09-02 — `lib/ai/people-explain.ts`, `lib/ai/provider.ts`, `ai_prompts/people_match_explanation_prompt.txt`, `lib/people/match-explanation.ts`, `lib/people/match-worker.ts`, `lib/people/background-jobs.ts`, `app/api/internal/people/jobs/run/route.ts`, `types/index.ts`, `scripts/people_match_explain.test.ts`, `scripts/people_match_worker.test.ts`, `scripts/ai_provider.test.ts`, `package.json`

- [x] **D5** Candidate ranking UI (advisory; manual override). Depends: D4. — 2026-09-02 — `lib/people/candidate-jobs.ts`, `app/api/people/jobs/[id]/candidates/route.ts`, `app/api/people/candidate-jobs/[id]/route.ts`, `components/people/JobCandidatesRank.tsx`, `components/people/JobDetail.tsx`, `scripts/people_candidate_jobs_api.test.ts`
  Done: 2026-09-02 — `lib/people/candidate-jobs.ts`, `app/api/people/jobs/[id]/candidates/route.ts`, `app/api/people/candidate-jobs/[id]/route.ts`, `components/people/JobCandidatesRank.tsx`, `components/people/ranking-labels.ts`, `components/people/JobDetail.tsx`, `components/people/JobsList.tsx`, `lib/queries/fetchers.ts`, `lib/queries/keys.ts`, `types/index.ts`, `scripts/people_candidate_jobs_api.test.ts`, `package.json`

- [x] **D6** Four-stage pipeline: New → Shortlisted → Contacted → Decision. Depends: D5. — 2026-09-02 — `lib/people/candidate-jobs.ts`, `app/api/people/jobs/[id]/candidates/stage/route.ts`, `components/people/JobCandidatesRank.tsx`
  Done: 2026-09-02 — `lib/people/candidate-jobs.ts`, `app/api/people/candidate-jobs/[id]/route.ts`, `app/api/people/jobs/[id]/candidates/route.ts`, `app/api/people/jobs/[id]/candidates/stage/route.ts`, `components/people/JobCandidatesRank.tsx`, `components/people/CandidateStagePill.tsx`, `components/people/pipeline-labels.ts`, `lib/queries/fetchers.ts`, `lib/queries/keys.ts`, `types/index.ts`, `scripts/people_candidate_jobs_api.test.ts`

- [x] **F1** Generic email draft service (never sends). Depends: none. — 2026-09-02 — `lib/ai/draft-email.ts`, `lib/ai/email-draft.ts`, `ai_prompts/email_draft_prompt.txt`, `scripts/ai_email_draft.test.ts`
  Done: 2026-09-02 — `lib/ai/draft-email.ts`, `lib/ai/email-draft.ts`, `ai_prompts/email_draft_prompt.txt`, `lib/ai/provider.ts`, `scripts/ai_email_draft.test.ts`, `scripts/ai_provider.test.ts`

- [x] **F2** Composer + explicit send (real UI pickers; Gmail if connected, else SMTP mailbox). Depends: F1, A1, and B1 or C2. — 2026-09-02 — `supabase/migrations/20260902160000_people_message_drafts.sql`, `lib/people/email-drafts.ts`, `app/people/email/page.tsx`, `scripts/people_email_api.test.ts`
  Done: 2026-09-02 — `supabase/migrations/20260902160000_people_message_drafts.sql`, `lib/people/email-drafts.ts`, `lib/people/email-transport.ts`, `app/api/people/email/drafts/route.ts`, `app/api/people/email/drafts/[id]/route.ts`, `app/api/people/email/drafts/[id]/send/route.ts`, `app/people/email/page.tsx`, `components/people/PeopleEmailComposer.tsx`, `scripts/people_email_schema.test.ts`, `scripts/people_email_api.test.ts`

- [x] **F3** Post-send follow-up confirmation (separate from send; no auto status change). Depends: F2. — 2026-09-02 — `lib/people/email-follow-up.ts`, `app/api/people/email/drafts/[id]/follow-up/route.ts`, `components/people/PeopleEmailFollowUp.tsx`, `scripts/people_email_api.test.ts`
  Done: 2026-09-02 — `lib/people/email-follow-up.ts`, `app/api/people/email/drafts/[id]/follow-up/route.ts`, `components/people/PeopleEmailFollowUp.tsx`, `components/people/PeopleEmailComposer.tsx`, `lib/people/email-drafts.ts`, `lib/queries/fetchers.ts`, `lib/queries/keys.ts`, `types/index.ts`, `scripts/people_email_api.test.ts`

- [x] **G1** Read-only People snapshot in existing Chat. Depends: B1, C1, C2. — 2026-09-02 — `lib/chat/analyst-context.ts`, `lib/chat/system-prompt.ts`, `scripts/chat_analyst.test.ts`
  Done: 2026-09-02 — `lib/chat/analyst-context.ts`, `lib/chat/system-prompt.ts`, `lib/chat/persona.ts`, `scripts/chat_analyst.test.ts`, `scripts/chat_prompt_injection.test.ts`, `package.json`

### Wave 1 complete

- [x] **W1** All Wave 1 boxes above are `[x]`. Founder can: roster + CSV, job + ranked candidates, four stages, explicit email send, Chat answers from People snapshot without mutating. Run `npm run test:gate`. — 2026-09-02
  Done: 2026-09-02 — `npm run test:gate` pass (lint, People tests, `test:chat-analyst`, `test:prompt-injection`, n8n export, build)

### Wave 2 — do not start until W1 is ticked

- [x] **G2** People read tools in Chat (only if G1 Q&A is insufficient). Depends: G1. — 2026-09-02 — `lib/chat/people-tools.ts`, `lib/chat/openai.ts`, `app/api/chat/route.ts`
  Done: 2026-09-02 — `lib/chat/people-tools.ts`, `lib/chat/openai.ts`, `lib/chat/system-prompt.ts`, `app/api/chat/route.ts`, `scripts/chat_people_tools.test.ts`, `scripts/chat_prompt_injection.test.ts`, `package.json`
- [x] **G3** Confirmation-gated People tools — 2026-09-02 — `lib/chat/people-propose.ts`, `app/api/chat/actions/route.ts`, `components/chat/ProposedActionCard.tsx`
  Done: 2026-09-02 — `supabase/migrations/20260902170000_chat_proposed_actions.sql`, `lib/chat/people-propose.ts`, `lib/chat/openai.ts`, `lib/chat/system-prompt.ts`, `app/api/chat/route.ts`, `app/api/chat/actions/route.ts`, `app/api/chat/actions/[id]/route.ts`, `app/chat/page.tsx`, `components/chat/ProposedActionCard.tsx`, `types/index.ts`, `scripts/chat_proposed_actions.test.ts`, `scripts/chat_proposed_actions_schema.test.ts`, `scripts/chat_prompt_injection.test.ts`, `package.json`
- [x] **H1** CandidateSource adapter (interface only). Depends: C2. — 2026-09-02 — `lib/people/sources/*`, `lib/people/candidates.ts`, `scripts/people_candidate_source.test.ts`
  Done: 2026-09-02 — `lib/people/sources/`, `lib/people/candidates.ts`, `types/index.ts`, `scripts/people_candidate_source.test.ts`, `scripts/people_candidates_api.test.ts`, `package.json`
- [x] **H2** One consented external source (human-picked; not GitHub scrape-by-default). Depends: H1. — 2026-09-02 — `lib/people/from-source.ts`, `app/api/people/candidates/from-source/route.ts`, `components/people/CandidateGithubImport.tsx`
  Done: 2026-09-02 — `lib/people/sources/github.ts`, `lib/people/from-source.ts`, `lib/people/candidate-jobs.ts`, `lib/people/candidate-csv.ts`, `app/api/people/candidates/from-source/route.ts`, `components/people/CandidateGithubImport.tsx`, `scripts/people_from_source.test.ts`, `package.json`
- [x] **I1** Mini-router (people vs revenue vs small-talk; no mega-tools). Depends: G2, G3. — 2026-09-02 — `lib/chat/route-lane.ts`, `lib/chat/openai.ts`, `lib/chat/system-prompt.ts`, `app/api/chat/route.ts`
  Done: 2026-09-02 — `lib/chat/route-lane.ts`, `lib/chat/openai.ts`, `lib/chat/system-prompt.ts`, `app/api/chat/route.ts`, `scripts/chat_router.test.ts`, `scripts/chat_prompt_injection.test.ts`, `package.json`
- [x] **J1** Embed People summaries only when a feature reads that `kind` — 2026-09-02 — `supabase/migrations/20260902180000_embeddings_people_summary_kind.sql`, `lib/people/summaries.ts`, `lib/people/embed.ts`, `lib/embeddings/store.ts`
  Done: 2026-09-02 — `supabase/migrations/20260902180000_embeddings_people_summary_kind.sql`, `lib/embeddings/store.ts`, `lib/people/summaries.ts`, `lib/people/embed.ts`, `lib/people/employees.ts`, `lib/people/jobs.ts`, `lib/people/candidates.ts`, `lib/people/match-worker.ts`, `lib/chat/analyst-context.ts`, `lib/chat/system-prompt.ts`, `app/api/chat/route.ts`, `app/chat/page.tsx`, `app/api/internal/n8n/match-embeddings/route.ts`, `scripts/people_summaries.test.ts`
- [x] **K1** n8n triggers calling Nexus APIs (policy stays in Nexus) — 2026-09-03 — `n8n_logic/exports/wf9_people_match_drain.json`, `scripts/people_n8n_drain.test.ts`
  Done: 2026-09-03 — `n8n_logic/exports/wf9_people_match_drain.json`, `scripts/people_n8n_drain.test.ts`, `scripts/prepare_n8n_deploy_payload.mjs`, live n8n `d1CkkuSDwsZKVhQq` (published)
- [x] **L1** Production hardening audit — 2026-09-03 — `supabase/migrations/20260903120000_people_hardening_grants.sql`, `lib/ai/budget.ts`, `app/api/people/candidates/export/route.ts`
  Done: 2026-09-03 — `supabase/migrations/20260903120000_people_hardening_grants.sql`, `lib/ai/budget.ts`, `lib/ai/people-explain.ts`, `lib/ai/draft-email.ts`, `lib/embeddings/store.ts`, `lib/people/candidate-csv.ts`, `app/api/people/candidates/export/route.ts`, `components/people/CandidatesList.tsx`, `scripts/people_hardening.test.ts`

### Human (not agent)

- [ ] Apply Wave 1 migrations on hosted Supabase — **A1 `audit_events` applied 2026-09-01** (MCP `apply_migration`; remote version `20260901070541`); **A2 `people_schema` applied 2026-09-01** (remote version `20260901072620`); **D1 `background_jobs` applied 2026-09-02** (MCP `apply_migration`); **D3 `candidate_jobs_scoring_version_text` applied 2026-09-02** (remote version `20260902094158`); **F2 `people_message_drafts` applied 2026-09-02** (MCP `apply_migration`); **G3 `chat_proposed_actions` applied 2026-09-02** (MCP `apply_migration`; remote version `20260902124059`); **J1 `embeddings_people_summary_kind` applied 2026-09-02** (MCP `apply_migration`); **L1 `people_hardening_grants` applied 2026-09-03** (MCP `apply_migration`); B1+ pending
- [x] After D1: cron that POSTs the People job-run endpoint — **K1 WF9 `d1CkkuSDwsZKVhQq` published 2026-09-03** (every 15 min → `POST /api/internal/people/jobs/run`)
- [ ] Private `people-imports` bucket if B4 stores files (skip if B4 is in-memory) — **B4 used in-memory 2026-09-02, no bucket**

---

## How to use this file

1. Open the **Build checklist**. Implement the first `- [ ]` Wave 1 row whose **Depends** are already `[x]`.
2. Paste the **Shared agent contract**, then that partition’s prompt in §12. Never two partitions.
3. Inspect current code, reuse it, refuse scope creep. Do not rewrite Revenue, Chat, n8n, or Social.
4. After verify passes: set that row to `- [x]`, fill **Done:** with date and key paths, save this file.

---

## 1. Product thesis (keep this)

Nexus OS is not “an HR module bolted onto a CRM.”

It is an **AI operating layer for a small business**, where the founder stays the highest-authority decision maker and Nexus does repetitive analysis and operational prep underneath them.

Positioning (external): **“Give every founder an AI operating team.”**
Do not market “replace your managers.” The work still exists; the extra headcount does not.

```text
                         FOUNDER / OWNER
                    Strategic decisions
                    Final approvals
                    Exceptions
                              │
                 ┌────────────▼────────────┐
                 │       NEXUS OS          │
                 │   Operating layer       │
                 └────────────┬────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
   Revenue (live)         People (this plan)     Marketing (live studio)
   Inbox / leads          Employees              Social posts
   Classification         Candidates             Captions / images
   Approval-gated send    Jobs / matching        Approval / schedule
```

**Rule:** AI proposes, drafts, ranks, and executes *approved* operational work. The founder controls authority. The backend enforces that — not the prompt.

---

## 2. Verdict on the incoming 12-phase plan

The incoming plan is directionally right and operationally too large. It would recreate primitives this repo already has, and it would violate the architecture that already works for revenue.

### Accept (non-negotiable)

| Idea | Why it stays |
|------|----------------|
| Founder = authority; Nexus = operating layer | This is the product. |
| Deterministic score, then LLM explanation | LLM-as-score is unauditable and unstable. |
| No evidence → no claim | Stops hallucinated hiring narratives. |
| Sparse data → `insufficient_data`, not a fake 47/100 | Honesty is the feature. |
| Human confirmation for outbound and employment-status changes | Matches existing approval philosophy. |
| Backend enforces confirmation; prompts do not | Same as `lib/approval-policy.ts` for replies. |
| Domain-scoped tools if/when an agent exists | No mega-agent with 30 tools. |
| People Intelligence, not an ATS-only schema | Employees + candidates + jobs, room to grow. |
| Minimal schema first | Additive migrations only. |
| CSV with row-level errors and partial success | Founders live in spreadsheets. |
| Structured UI controls, not the model parsing “yes” | Required for any later chat mutations. |
| Send email ≠ mutate employee | Separate confirmations. |
| n8n orchestrates; Nexus owns business logic | Current n8n contract already works this way. |
| Small partitions, schema → service → API → UI → AI | How this repo actually ships. |
| RLS + `team_id` / `workspace_id` from day one | Existing tenant model. |
| No LinkedIn scrape; no mass outreach | Legal / ToS / consent. |

### Reject or defer (do not implement in this program)

| Incoming idea | Decision | Reason |
|---------------|----------|--------|
| Phase 1 “platform foundation” before any People UI | **Reject as a block** | Over-abstracts for imaginary consumers. Extract primitives when the first feature needs them (audit now; jobs when matching; action registry when email send exists). |
| Rebuild AI usage tracking | **Reject** | `ai_usage` + `recordAiUsage()` already exist (`20260714190000_ai_usage.sql`, `lib/ai/provider.ts`). |
| New confirmation product that competes with `/approval` | **Reject** | Extend the *idea* of founder approval. People UI uses in-page confirm + audit. People email uses a **draft then explicit send** (same shape as `reply_drafts`). Do not add a second approval inbox. |
| Five domain agents + Nexus Router now | **Defer** | Chat is a high-quality **read-only** analyst (`lib/chat/system-prompt.ts`). A router+tools rewrite is the riskiest change in the repo. Revenue pipeline must stay functions. |
| Trigger.dev as the job runner | **Reject unless a human chooses it** | `trigger.config.ts` exists; `src/trigger/` does not; `@trigger.dev/sdk` is not in `package.json`. Use a `background_jobs` table modeled on `gmail_backfill_jobs`. |
| Generic ETL “Data Import Engine” as a platform | **Narrow** | One shared CSV parser used by employees then candidates. Not a universal ingest product. |
| GitHub / public candidate discovery | **Defer (Wave 2+)** | ToS, missing emails, consent, and it is not how most small businesses hire. v1 is founder-owned data (CSV + manual). |
| Resume PDF parsing as v1 | **Defer** | `pdf-parse` exists for knowledge docs. Add CV parse after CSV matching works. |
| Leave, payroll, performance, org chart, onboarding suites | **Out of scope** | Schema must not block them; do not build them. |
| OpenRouter migration / `organizations` as People tenant root | **Reject** | App AI is OpenAI via `lib/ai/*`. People rows use `team_id` + `workspace_id` like `conversations` / `leads`. Social keeps `organization_id` until a later unification. |
| Cross-domain CEO agent, automation, production-hardening *phases* as People prerequisites | **Defer** | Those are sequels. Knowledge RAG already exists. |
| Wrapping Posts Studio in a Marketing Agent | **Defer** | Studio already ships. |

### One important change to Claude’s “don’t build HR yet”

That is good *startup sequencing* if Nexus had no users and no second domain. The goal here is explicitly: **help startups run without hiring extra managers.** People is the second operating domain (Revenue is first). Build a **thin, honest wedge**, not 37 HR features and not a 12-phase OS rewrite.

**Wedge (must be demoable):**

1. Employee roster (replaces the founder’s spreadsheet).
2. Job + uploaded candidates + explainable ranking (replaces first-pass screening).
3. Nothing leaves the building (email) without an explicit founder send.

---

## 3. Repository truth (Phase 0 — already done)

Do not spend a conversation re-deriving this. Re-inspect files you will *edit*; do not reinvent tenant/AI/approval architecture.

### Stack (from code, not marketing copy)

| Layer | Actual |
|-------|--------|
| App | Next.js 14 App Router (`package.json`: `next@^14.2.35`) |
| DB | Supabase Postgres + RLS. Latest local migration at time of writing: `20260718120000_generic_mailbox_credentials.sql` |
| AI | OpenAI via `lib/ai/provider.ts` (gpt-4o / gpt-4o-mini / embeddings). n8n calls `/api/internal/n8n/ai/*` — it does not hold `OPENAI_API_KEY` |
| Orchestration | n8n Cloud + `n8n_logic/`. Business rules stay in Next.js/`lib/` |
| Chat | Read-only Revenue Analyst at `/chat` (`app/api/chat/route.ts`, `lib/chat/*`) |
| Knowledge | One `embeddings` table, `kind` in (`business_doc`, `conversation`, `summary`, `people_summary`) |
| Approval | `lib/approval-policy.ts` + `/approval` + `reply_drafts` |
| Tenancy | Pipeline: `teams` → `workspaces` → `team_id` / `workspace_id`. Social: `organizations`. Bridge: `teams.organization_id` (`20260717120000_teams_organization_id_bridge.sql`) |
| API auth | `requireApiTenantContext()` in `lib/api-security.ts` (user + `profiles.team_id` + first workspace). Rate limits on routes |
| Nav | `components/layout/AppSidebar.tsx` — `/dashboard` `/inbox` `/approval` `/report` `/posts` `/chat` `/people` `/team` `/profile` |
| `/team` | **Nexus workspace invites** (`app/team/page.tsx` → `InviteManager`). **Not company employees.** People UI must be `/people` |
| UI kit | Hand-built `components/ui/*` (Button, Card, Badge, EmptyState, FilterChip, Spinner, …). shadcn is configured, not installed |
| Data UI | React Query + `lib/queries/fetchers.ts` + `lib/queries/keys.ts` + `authenticatedFetch` |
| Jobs today | `gmail_backfill_jobs` (domain-specific). No generic queue. Trigger.dev is unused |
| Observability | `workflow_logs` (n8n steps, not an audit log). `ai_usage` (token accounting) |
| Tests | `scripts/*.test.ts` via `tsx` + `npm run test:gate` |

### Patterns new People code MUST reuse

- Mutations: `requireApiTenantContext()` then filter by `teamId`. Never trust client-supplied `team_id`.
- RLS: `team_id = (select private.current_team_id())`, enable RLS on create, revoke anon.
- Team stamp: `trg_chat_set_team_from_workspace()` / equivalent on insert of `workspace_id`.
- Uploads: `app/api/business-docs/route.ts` (size cap, safe file name, private bucket, tenant path).
- AI: only `lib/ai/*` + `recordAiUsage()`. New operations are extra `workflow_name` strings, not a new usage table.
- Outbound: generate draft → persist → human act → send executor. Classifiers/drafters never send.
- Pure policy in `lib/` with `scripts/*_policy.test.ts` (copy `scripts/approval_policy.test.ts`).
- Additive numbered SQL under `supabase/migrations/`. Never edit old migrations. Next timestamp must sort **after** `20260718120000`.
- iCloud hazard: never read/edit/import `* 2.ext`.

### Architectural risks to respect (do not “fix” inside a People partition)

1. Dual tenant IDs (`team_id` vs `organization_id`) — People uses pipeline tenancy only.
2. Chat is read-only by construction — do not add tools in early partitions.
3. n8n production URL vs missing internal routes on some branches — out of scope.
4. `trigger.config.ts` orphan — do not build on it.
5. Graphify: use `./scripts/graphify.sh` — see `docs/GRAPHIFY.md`.

---

## 4. Target architecture (fits this repo)

Keep the **layering** from the incoming plan. Do not invent a parallel runtime.

```text
┌──────────────────────────┐
│  AI layer                │  interpretation, explanation, draft text
│  lib/ai/*  + prompts     │  NEVER authorization, NEVER final numeric score
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│  Nexus services          │  validation, scoring, CSV, state transitions
│  lib/people/*            │  deterministic; unit-tested
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│  HTTP + policy           │  requireApiTenantContext, rateLimit,
│  app/api/people/*        │  draft-vs-send, confirm employment-status
└────────────┬─────────────┘
             ▼
┌──────────────────────────┐
│  Postgres + RLS          │  team_id / workspace_id on every row
└──────────────────────────┘
```

Chat stays the Revenue Analyst. After People data exists, **G1** may add a **read-only People snapshot** to `buildAnalystContext` (same pattern as leads). That is not a router.

People email is a **dedicated composer** (form + structured pickers + editable draft), not a widget-chat OS, until G1 proves read-only Q&A is not enough.

---

## 5. People domain model (minimal, extensible)

Internal name: **People**. Routes: `/people/*`. Nav label: **People**. Never collide with `/team`.

```text
People
├── Employees     (roster; no AI in CRUD)
├── Jobs          (requirements + versioned weights)
├── Candidates    (founder-owned; source provenance)
├── Applications  (candidate_jobs: stage + score + explanation)
├── Imports       (CSV; shared parser)
└── Audit         (append-only; also feeds activity UI)
```

### Tables (A2 — do not add more in A2)

`employees` — identity + role_title + employment_status + dates + location + notes + `archived_at`. Unique `(team_id, lower(email))` where email present and not archived.

`jobs` — title, description, status (`draft|open|closed`), required/preferred skills (`jsonb` string arrays), experience min/max, seniority, location, remote_policy, `scoring_weights jsonb`, `scoring_weights_version int`.

`candidates` — identity, headline, current_role, experience_years, skills `jsonb`, location, `source`, `source_url`, `source_metadata jsonb`, `consent_status` (`owner_imported|candidate_applied|unknown`), notes, `archived_at`. Unique `(team_id, lower(email))` where email present and not archived.

`candidate_jobs` — `(candidate_id, job_id)` unique. `stage` (`new|shortlisted|contacted|decision`). Nullable scoring columns: `match_score`, `match_components`, `match_weights_used`, `scoring_version`, `data_quality` (`pending|sufficient|insufficient`), `insufficient_reason`, `ai_explanation jsonb`, `ai_model`, `ai_prompt_version`, `manual_rank_override`. `assigned_to` uuid nullable (auth user).

`background_jobs` — generic, **new rows only** (do not migrate `gmail_backfill_jobs` in this program). `kind`, `status` (`queued|running|completed|failed|cancelled`), `payload jsonb`, `progress jsonb`, `error`, `idempotency_key`, `attempts`, `run_after`, lock columns. Tenant scoped.

`import_rows` optional: prefer storing row errors on `background_jobs.progress` / a small `import_row_errors` table if needed for UI. Do not overbuild.

**Do not create** `people_activity` if `audit_events` can serve the activity timeline (DRY).

### Default scoring weights (stored on the job, versioned)

Must sum to `1.0` (validate on write):

```text
technical_fit     0.40
experience_fit    0.25
seniority_fit     0.15
location_fit      0.05
nice_to_have      0.10
data_quality      0.05
```

Changing weights increments `scoring_weights_version` and does not rewrite old `candidate_jobs` scores until a re-run.

### Compliance (from the old hiring blueprint — stronger than the incoming plan)

- Store only data needed to contact and evaluate against a job.
- `consent_status` on every candidate.
- No inferred protected attributes (age, gender, marital status, religion, health, ethnicity, etc.).
- No fabricated emails, salaries, or GitHub-less contact data.
- CSV: reject spreadsheet formula injection (`=`, `+`, `-`, `@` at cell start) by treating those cells as text or failing the row.
- PII: do not put full candidate payloads in `workflow_logs`. Audit prev/next state may store field-level diffs; avoid dumping entire CVs into logs.
- Archive over hard delete in v1; add a real deletion/export path before public launch (called out in G1 notes / later hardening).

---

## 6. Scoring contract (D2–D4)

```text
Candidate facts + job requirements
        → deterministic features
        → weighted score OR insufficient_data
        → LLM explanation of the *already computed* evidence
        → human ranking / stage / override
```

LLM output shape (validate; discard malformed):

```json
{
  "summary": "…",
  "strengths": [],
  "gaps": [],
  "evidence": [],
  "concerns": [],
  "recommendation": "strong_match | possible_match | weak_match | insufficient_data"
}
```

`recommendation` means **recommended for human review**, never hire/reject.

Prompt must forbid em dash / en dash in generated *letters* (F1). Scoring explanations should also avoid inventing punctuation-as-style that hides missing evidence.

---

## 7. Background work

When candidate matching or large candidate CSV needs more than a short request:

1. Insert `background_jobs` (`queued`, idempotency key).
2. Process in batches inside `app/api/internal/people/jobs/run` (or similar), token-auth **or** authenticated founder poll + server cron later.
3. **n8n may trigger the run endpoint.** n8n must not compute scores.
4. UI polls job status. Never loop 100 LLM calls in one user request.

Until D1, employee CSV may be **synchronous with a hard row cap** (e.g. 500) so B4 stays small.

---

## 8. What “done” looks like for this program (Wave 1)

A founder can:

- Import/export employees and maintain the roster without AI.
- Define a job with skills and weights.
- Import candidates from CSV, see row-level failures.
- Get a ranked list with breakdown, evidence, and an advisory AI summary.
- Move people through New → Shortlisted → Contacted → Decision.
- Draft and **explicitly send** an email; optionally confirm a follow-up status change.
- Ask Chat read-only questions that use a People snapshot (G1).

A founder cannot:

- Have Nexus hire, reject, or terminate anyone.
- Have Nexus email without pressing send on a stored draft.
- Have Nexus change employment status as a side effect of sending.

---

## 9. Deferred (Wave 2+) — do not sneak into Wave 1 partitions

- Candidate source adapters (`CandidateSource`) and GitHub discovery.
- Nexus Router and Marketing/Customer/Operations agents.
- Conversational tool-calling People Agent (after G1).
- n8n “when shortlisted, draft email” automations.
- CV PDF parse, leave, payroll, performance.
- Unifying `organizations` vs `teams`.
- Migrating `gmail_backfill_jobs` onto `background_jobs`.

---

## 10. Partition tracker

Status lives only in the **Build checklist** at the top of this file. Do not duplicate a pending/done table here.

---

## 11. Shared agent contract (paste at the top of every partition)

```text
You are implementing ONE numbered partition from docs/NEXUS_OPERATING_LAYER_PLAN.md.

Read before any edit:
- .cursor/rules/nexus.mdc
- The partition section you were given (only)
- The existing files that partition lists under Reuse

Hard rules:
1. Inspect current code. Reuse patterns. Do not invent a parallel architecture.
2. Implement only this partition. If you need a missing primitive from an earlier partition, STOP.
3. Tenant isolation: team_id + workspace_id from requireApiTenantContext(). Never trust client tenant ids.
4. Do not use organization_id as the People tenant root.
5. Do not read, edit, or import files named "* 2.ext".
6. Additive migrations only. Next SQL filename must sort after the latest existing supabase/migrations/*.sql.
7. RLS on every new table from the first migration. Enable RLS + team policies + revoke anon.
8. No AI in CRUD partitions. No GitHub. No router. No mega-agent.
9. LLM never authorizes and never computes the official match score.
10. After implementation: re-read your diff, DRY, small functions, early returns, no dead code, no console.log, no nested if/else ladders.
11. Security: parameterized Supabase queries only; rateLimit on new routes; validate/limit payloads; CSV injection; no secret leakage; no user data in client-trusted filters.
12. Run the partition’s verify commands. Do not claim done if they fail.
13. End with the report-back block from .cursor/rules/nexus.mdc.
14. Never silently redesign unrelated features or global navigation (B2 may add ONE People item only).
15. When verify passes, tick this partition in the Build checklist at the top of this file (`[ ]` → `[x]`), fill Done with date and key files, and save. Do not tick if tests failed.
```

---

## 12. Partitions (copy-paste prompts)

Each prompt is the full task. Do not combine them.

---

### A1 — Append-only audit log

**Goal:** Tenant-scoped, append-only `audit_events` + server writer. No People UI.

**Reuse:** `requireApiTenantContext()`, RLS style in `20260714190000_ai_usage.sql` (select for members, writes not for `authenticated` if you choose service/server-only inserts — prefer **authenticated insert with RLS** so the app user is the actor, but **revoke UPDATE and DELETE** from `authenticated` and `anon`). `lib/api-security.ts` for actor = `user.id`.

**In scope:** migration; `lib/audit.ts` `writeAuditEvent()` that ignores client actor/tenant and uses context; indexes `(team_id, created_at desc)`, `(team_id, entity_type, entity_id)`; tests for write, tenant isolation, update/delete denied.

**Out of scope:** People tables, UI, n8n, changing `workflow_logs`.

**Verify:** `npm run test:migration-order`, new `npm run test:audit` (add script), `npx tsc --noEmit` or `npm run lint`.

**Prompt:**

```text
Implement partition A1 only from docs/NEXUS_OPERATING_LAYER_PLAN.md.

Create public.audit_events:
- id uuid pk
- team_id uuid not null references teams
- workspace_id uuid references workspaces
- actor_user_id uuid references auth.users (nullable for system)
- domain text not null  -- e.g. people | revenue | system
- action text not null
- entity_type text not null
- entity_id uuid
- prev_state jsonb
- next_state jsonb
- metadata jsonb not null default '{}'
- created_at timestamptz default now()

RLS: members can SELECT their team. INSERT allowed for authenticated only when team_id = current_team_id() AND actor_user_id = auth.uid(). No UPDATE/DELETE policies. Revoke update/delete.

writeAuditEvent must take a server tenant context; never accept actor/team from the request body.

Add scripts/audit.test.ts covering: insert ok, cross-tenant cannot read, update rejected.

Do not build HR features.
```

---

### A2 — People schema + RLS

**Goal:** Minimum People tables. No API, no UI, no AI.

**Reuse:** `0001_initial_schema.sql` FKs; knowledge-layer RLS; `trg_chat_set_team_from_workspace` if still the canonical team-stamp trigger (inspect — do not duplicate a second stamp function if one exists).

**In scope:** `employees`, `jobs`, `candidates`, `candidate_jobs` as specified in §5. Check constraints for enums. Soft archive columns. Indexes for team list queries and `candidate_jobs (job_id, match_score desc)`. Comments on tables. Optional: do **not** add `background_jobs` here (D1).

**Out of scope:** scoring, CSV, routes, nav.

**Verify:** `npm run test:migration-order`; add `scripts/people_schema.test.ts` that reads the new SQL and asserts RLS enabled, tenant columns, and stage check include the four stages.

**Prompt:**

```text
Implement partition A2 only from docs/NEXUS_OPERATING_LAYER_PLAN.md §5.

Inspect private.current_team_id() and an existing tenant table’s RLS. Copy that pattern.

Follow the actual tenant model (teams/workspaces). Do not use organizations as the row owner.

Keep the schema minimal and extensible. No scoring worker, no GitHub columns, no nine ATS stages.

Unique emails per team for non-archived employees and candidates (case-insensitive).

Run migration-order tests and a new schema assertion test.
```

---

### B1 — Employee service + API

**Goal:** Server-side employee CRUD + search. Audit writes. No UI.

**Reuse:** `app/api/conversations/route.ts` (rateLimit, requireApiTenantContext, bounded strings); `writeAuditEvent`; types in `types/` if that is where Conversation lives — inspect and match.

**In scope:** `lib/people/employees.ts`; `GET/POST /api/people/employees`; `GET/PATCH /api/people/employees/[id]`; archive via `PATCH { archived: true }` or `POST .../archive` (pick one, document). Search q on name/email. employment_status allowlist. Never take team_id from body.

**Out of scope:** UI, CSV, AI. Do not allow `offboarded` / `resignation_pending` without the same validation as other statuses yet (allow the enum; F3 adds extra confirmation for chat/email). For API, require the field to be in the allowlist; UI will confirm.

**Verify:** `scripts/people_employees_api.test.ts` with mocked supabase like `scripts/approval_route.test.ts`. Cases: create, list scoped, reject extra fields, archive audited, unauthorized, missing tenant.

**Prompt:**

```text
Implement partition B1 only.

Employee API using A2 tables and A1 audit. Follow conversations route security patterns.

employment_status allowlist: active | onboarding | resignation_pending | offboarded.
Archive is soft (archived_at).

No UI. No CSV. No AI.
```

---

### B2 — Employee UI + nav

**Goal:** `/people` employees list/detail/create/edit/archive. One sidebar item.

**Reuse:** `AppSidebar.tsx` `appNav`; `inbox/page.tsx` FilterChip, EmptyState, Spinner, React Query; `lib/queries/keys.ts` + fetchers; `components/ui/*`. Do not install shadcn.

**In scope:** pages under `app/people/`; components under `components/people/`; fetcher + query keys; prefetch in `nav-prefetch.ts` for `/people`. Loading/empty/error. Responsive. Confirm dialog before archive.

**Out of scope:** Candidates, jobs, CSV, AI, redesigning other nav items. `/team` stays invites.

**Verify:** `npm run lint`, `npm run build`. Browser-check list/create/edit/empty if a server is available; otherwise state that limitation.

**Prompt:**

```text
Implement partition B2 only.

Employee management UI on /people (employees as default). Add a single "People" item to AppSidebar. Do not redesign navigation otherwise. Do not reuse /team.

Reuse existing UI components and React Query fetchers.

No AI. No CSV. Proper empty/loading/error states.
```

---

### B3 — Shared CSV parser (pure)

**Goal:** Parse, map columns, validate, detect duplicates in-memory. No HTTP.

**Reuse:** none required. Keep **zero** Next.js imports so tests stay pure.

**In scope:** `lib/csv/parse.ts` (or `lib/import/csv.ts`): delimiter detect, header row, mapping `{ sourceColumn → field }`, per-row errors, duplicate keys, formula-injection handling, summary `{ imported, updated, duplicates, failed }` as a **plan** object (no DB). Profiles: `employee` and `candidate` field dictionaries (required vs optional).

**Out of scope:** upload, storage, employees table writes.

**Verify:** `scripts/csv_engine.test.ts` — malformed CSV, missing required columns, duplicates, `=CMD` cells, large-ish string, quoted commas.

**Prompt:**

```text
Implement partition B3 only.

Reusable CSV engine for People. Support employee fields now and candidate fields in the dictionary so C3 does not fork a second parser.

Do not upload or write to the database. Pure functions + tests.
```

---

### B4 — Employee CSV import/export

**Goal:** Upload → map → preview → import with partial success; export current roster.

**Reuse:** B3; business-docs upload limits; B1 employee service (upsert by email); audit; private storage bucket `people-imports` if files must persist — otherwise parse in-memory under a size cap (1 MB) to stay small. Prefer **in-memory + cap** unless storage is clearly needed.

**In scope:** API + UI on employees page. Summary: `942 imported / 37 updated / 21 duplicates / 8 failed` with row errors. Export CSV of non-archived employees. Row cap 500.

**Out of scope:** Candidate import, AI, background_jobs, second parser.

**Verify:** tests for duplicate email upsert, over-cap rejection, mapping preview. lint + build.

**Prompt:**

```text
Implement partition B4 only.

Wire B3 into employee import/export. Tenant isolation. Show row-level failures. Partial success. No AI. No candidate import.
```

---

### C1 — Jobs API + UI

**Goal:** Create/edit jobs including skills, experience, location, remote, **versioned weights**.

**Reuse:** B1/B2 patterns. Validate weights sum to 1.0 ± epsilon.

**Out of scope:** matching, AI, candidates list.

**Verify:** unit test weight validation; API tests; lint.

**Prompt:**

```text
Implement partition C1 only from docs/NEXUS_OPERATING_LAYER_PLAN.md.

Job requirements foundation: fields in §5, configurable scoring weights stored on the job and versioned when changed.

No matching, no AI scoring, no candidate ranking UI.
```

---

### C2 — Candidate CRUD

**Goal:** Manual add/edit/list/detail candidates. Provenance fields. consent_status. No scores.

**Reuse:** employees UI patterns. Do not duplicate form primitives — extract a small shared People form field if B2 already copied too much (DRY).

**Out of scope:** CSV, scoring, GitHub.

**Prompt:**

```text
Implement partition C2 only.

Candidate CRUD, tenant isolated, audited mutations. Sparse records are valid. No AI. No scoring columns required on create.
```

---

### C3 — Candidate CSV for a job

**Goal:** Import candidates from CSV, upsert, attach `candidate_jobs` at stage `new`. No scores.

**Reuse:** B3, B4 UX, C1 job picker, C2 upsert. Idempotent: same file/email/job does not duplicate `candidate_jobs`.

**Out of scope:** LLM, deterministic scoring run (may enqueue later in D1 — **do not enqueue if D1 table missing**; just insert rows).

**Prompt:**

```text
Implement partition C3 only.

Candidate CSV ingestion + associate with selected job. Partial failures. Duplicate handling. Sparse candidates remain valid. No scores. No LLM.
```

---

### D1 — background_jobs + match worker skeleton

**Goal:** Persistent `background_jobs` + claim/run HTTP endpoint. No scoring.

**In scope:**

- Table: `id`, `team_id`, `workspace_id`, `kind` (text; first value `people.match`), `status` (`queued|running|completed|failed|cancelled`), `payload jsonb`, `progress jsonb`, `error`, `idempotency_key`, `attempts`, `run_after`, `locked_at`, `locked_by`, timestamps.
- Unique `(team_id, idempotency_key)` where key is not null.
- RLS like other People tables. Service/authenticated insert scoped to current team.
- `lib/people/jobs.ts`: `enqueue`, `claim`, `complete`, `fail`, `cancel`.
- `POST /api/internal/people/jobs/run` (ingest token, same pattern as n8n internal routes): claim up to N queued rows, dispatch by `kind`.
- For `people.match` in D1: complete the job with `progress: { processed: 0, note: "handler wired in D3" }` and do **not** write scores. D3 replaces this handler.
- Cron later POSTs this route (human: n8n schedule or Vercel cron). Document that in a comment on the route.

**Out of scope:** Trigger.dev, scoring math, LLM, Gmail backfill changes.

**Reuse:** `gmail_backfill_jobs` status/lock ideas. Do not modify Gmail jobs.

**Prompt:**

```text
Implement partition D1 only.

Smallest production-safe background job table for People matching (and future CSV if needed). States: queued, running, completed, failed, cancelled. Retry, idempotency_key, progress jsonb, tenant RLS, lock/claim to survive interruption.

Do not implement scoring. Do not use Trigger.dev. Do not put logic in n8n. Document how a later cron or n8n webhook will POST the run endpoint.

Inspect gmail_backfill_jobs and copy the spirit, not the Gmail columns.
```

---

### D2 — Deterministic scoring (pure)

**Goal:** Score function + tests. No DB.

**Prompt:**

```text
Implement partition D2 only.

Deterministic candidate matching in lib/people/score.ts (name may vary).

Inputs: normalized candidate, job requirements, weights.
Outputs: component scores, weighted total 0-100 OR { data_quality: "insufficient", reason }.

Rules:
- Missing required-skill evidence is not a match for that skill (score 0 for that skill), not invented competence.
- If too little data to evaluate required skills AND experience, return insufficient instead of a number.
- Explainability: return why each component scored as it did (evidence refs).
- Store scoring_version string constant in code.
- Comprehensive tests: full match, partial, remote vs office, empty skills, weight changes.
- No LLM. No n8n. No UI.
```

---

### D3 — Wire scoring to worker

**Goal:** `people.match` handler writes scores onto `candidate_jobs`, copies weights used, version, components. Skip insufficient with null score.

**Prompt:**

```text
Implement partition D3 only.

Connect D1 worker to D2 scoring. Batch candidate_jobs for a job_id. Idempotent re-run overwrites scores for that scoring_version+weights_version. Audit a job-level event, not per-row PII dumps.

No LLM explanation yet. No ranking UI.
```

---

### D4 — AI explanation

**Goal:** After scores exist, LLM fills `ai_explanation` JSON. `lib/ai/*` + `recordAiUsage`. Validate schema.

**Prompt:**

```text
Implement partition D4 only.

AI explanation layer. Do not change D2 math.

Model receives job requirements, candidate evidence, component scores, data quality.
Returns JSON: summary, strengths, gaps, evidence, concerns, recommendation.
Rules in docs/NEXUS_OPERATING_LAYER_PLAN.md §6.
No evidence → no claim. Never hiring decision. Never protected attributes. Never invent salary.
Persist model + prompt version. Reject malformed output and store error on the row.

Use lib/ai/provider.ts. Do not import openai from the route.
```

---

### D5 — Ranking UI

**Goal:** Job dashboard: sort by score (nulls last), breakdown, AI summary, evidence, data quality, source links, override, notes, bulk select. Advisory labeling.

**Prompt:**

```text
Implement partition D5 only.

Smart Candidate Matching UI using existing Nexus UI components.

Make it obvious the score and AI text are advisory. Support manual rank override.

No email send. No extra ATS stages.
```

---

### D6 — Four-stage pipeline

**Goal:** Move stage New → Shortlisted → Contacted → Decision; history via audit; bulk move; assigned_to optional.

**Prompt:**

```text
Implement partition D6 only.

Hiring pipeline with exactly four stages. Every transition writes audit_events. No AI. No automated decision. Tenant isolation. Bulk actions.
```

---

### F1 — Generic email draft service

**Goal:** `lib/ai/draft-email.ts` (name as needed) — not HR-specific. No send.

**Reuse:** `lib/ai/draft.ts` reply generation. Separate prompt file under `ai_prompts/`.

**Prompt:**

```text
Implement partition F1 only.

Reusable email drafting service for candidates, employees, customers, leads later.

Input: recipient context, situation, optional tone/purpose, tenant business_profiles snippets.
Output: subject, body, metadata. Validate. recordAiUsage. Log prompt/model version.

Never send. Never invent facts. Preserve user-provided facts.
System prompt: no em dash, en dash, or standalone dash punctuation in generated letters; use commas, periods, colons, or semicolons.

No chat UI.
```

---

### F2 — Composer + explicit send

**Goal:** UI with **real** employee/candidate/date/tone selectors (HTML controls). Generate → edit → send stored draft only.

**Reuse:** Gmail/mailbox send path (`lib/gmail/send.ts` / channel sender). **Do not** send via Chat. Persist `people_message_drafts` (or similar) with status `draft|sent|discarded`. Send endpoint loads draft by id + team_id.

**Prompt:**

```text
Implement partition F2 only.

Conversational-feeling composer is allowed, but selections MUST be real UI controls, not LLM-interpreted "yes".

Flow: pick recipient from People data → collect missing fields via inputs → F1 generate → editable draft → explicit Send.

Sending requires confirmation in the UI and a separate API from generate.
Failed send does not change employee/candidate rows.
Audit generate and send.

Inspect existing mail send; reuse transports. Do not auto-send.
```

---

### F3 — Post-send follow-up

**Goal:** After successful send, propose e.g. “mark resignation pending” as a **structured confirm**, separate request.

**Prompt:**

```text
Implement partition F3 only.

Generic action chaining after a successful people email send. Follow-up mutations are opt-in, structured, audited, and must not run if send failed.

LLM cannot bypass. Employee record does not change because an email was sent.
```

---

### G1 — Read-only People snapshot in Chat

**Goal:** Extend `buildAnalystContext` with compact People stats + top open jobs + candidates awaiting review. Update system prompt: still **read-only**, no “I emailed them.” Cite that People numbers come from the snapshot.

**Prompt:**

```text
Implement partition G1 only.

Add a tenant-scoped People section to the existing Revenue Analyst snapshot. Keep the agent read-only. No tools, no router, no mutations.

Reuse lib/chat/analyst-context.ts and tests in scripts/chat_analyst.test.ts + scripts/chat_prompt_injection.test.ts (extend injection tests so a user cannot jailbreak “update the employee”).

If People tables are empty, say so. Do not fabricate employees.
```

---

### G2 — People read tools in Chat

**Goal:** When the G1 snapshot cannot answer a named roster or pipeline question, Chat may call three **read-only** People tools. Still no mutations, no router, no send.

**Prompt:**

```text
Implement partition G2 only.

Add a closed allowlist of read-only People tools to the existing Revenue Analyst chat: search_employees, search_candidates, list_job_pipeline. Wrap lib/people list helpers. Project names/roles/stages/scores only — never email, phone, notes, or URLs. Cap queries at 80 characters and results at 8 rows. At most two tool rounds, then stream the final answer. Mock mode skips the loop.

User/knowledge text cannot add tools. Unknown names return an error JSON. Do not import update/create/send helpers. Extend scripts/chat_prompt_injection.test.ts and add scripts/chat_people_tools.test.ts.

No G3 confirmation-gated writes. No mini-router. No n8n. No migration.
```

---

### G3 — Confirmation-gated People tools

**Goal:** Chat may propose pipeline-stage and employment-status changes. Tools persist a pending row; they never mutate. A Confirm/Cancel card on `/chat` is the only executor. Action kinds live in code, not the prompt. No email send or draft from Chat.

**Prompt:**

```text
Implement partition G3 only.

Add propose_pipeline_stage and propose_employment_status to the existing Chat tool loop. Resolve by name like G2. Persist pending rows on chat_proposed_actions. Confirm/cancel via POST /api/chat/actions/[id] wrapping updateEmployee and updateCandidateJobPipeline. User text cannot confirm. No send_email, hire, or reject tool. No mini-router. No n8n.

Extend scripts/chat_prompt_injection.test.ts. Add scripts/chat_proposed_actions.test.ts and schema tests.
```

---

### H1 — CandidateSource adapter (interface only)

**Goal:** Closed `CandidateSource` registry + normalize. Shape the interface for H2 (founder pastes one GitHub profile). No live fetch, no UI, no routes, no scrape.

**Reuse:** `lib/people/candidates.ts` create/audit path; `candidates.source` / `source_url` / `source_metadata` / `consent_status`; CSV field names in `lib/csv/profiles.ts`. HTTP create must still reject `source_metadata`.

**Out of scope:** `api.github.com`, Octokit, new env vars, Chat, n8n, scoring, CSV/manual behavior change, LinkedIn, search/list on the interface.

**Verify:** `npm run test:people-candidate-source`, `npm run test:people-candidates`, `npm run lint`.

**Prompt:**

```text
Implement partition H1 only.

Closed CandidateSource adapter: ids manual | csv | github. Unknown ids fail closed. No search() or list() on the interface.

normalize(raw) → NormalizedCandidate (canonical source id, bounded source_metadata, consent_status, external_id).
optional parseRef for human-picked pull sources.
optional fetch typed but not implemented for GitHub in H1.

GitHub parseRef: github.com/{login} or bare login. Reject search, orgs, gists, owner/repo.
GitHub normalize: Users API–shaped object, no network. full_name = name else login. Never invent email (noreply dropped). skills []. experience_years null. default consent unknown.

persistNormalizedCandidate shares createCandidate insert/audit. POST /api/people/candidates still rejects source_metadata.

No GitHub HTTP. No new API routes. No UI. Do not rewire CSV import.
```

---

### H2 — One consented GitHub profile (do not run with H1)

**Goal:** Founder pastes one GitHub URL/username; server fetches that public user; persist via H1. No search, no scrape, no LinkedIn.

**Depends:** H1. Human ToS/consent review before live `api.github.com` calls.

**Prompt:**

```text
Implement partition H2 only.

github.fetch: GET https://api.github.com/users/{login} (User-Agent, application/vnd.github+json, timeout). Map through H1 normalize. 404 not found; 403 rate limited. Do not call search, list followers, or scrape HTML.

POST /api/people/candidates/from-source with requireApiTenantContext + rateLimit: { source: "github", ref, consent_status, job_id? }. Server parses ref, fetches, persistNormalizedCandidate. Client cannot supply source_metadata.

UI: one “Add from GitHub” field, explicit consent_status control. Never candidate_applied unless they applied. Optional job_id reuses C3 attach + enqueuePeopleMatchJob.

No GitHub OAuth unless a human asks. No discovery browser.
```

---

### I1 — Mini-router (Chat lanes)

**Goal:** One Chat agent. A pure function picks `people` | `revenue` | `smalltalk` | `mixed` and attaches the existing G2+G3 People tools only on people/mixed turns. No new tools, no LLM classifier, no domain agents, no n8n.

**Reuse:** `lib/chat/openai.ts` tool loop, `lib/chat/system-prompt.ts` RULES, `lib/chat/people-tools.ts`, `lib/chat/people-propose.ts`, `app/api/chat/route.ts`. Confirm/cancel stays on `/api/chat/actions/[id]`.

**Out of scope:** new tools, Chat UI lane chip, snapshot query slimming, extra classify LLM call, GitHub/H2, embeddings (`kind`), migrations.

**Verify:** `npm run test:chat-router`, `npm run test:prompt-injection`, `npm run test:chat-analyst`, `npm run test:chat-people-tools`, `npm run test:chat-proposed-actions`, `npm run lint`.

**Prompt:**

```text
Implement partition I1 only.

Deterministic mini-router in lib/chat/route-lane.ts (no LLM, no DB, no server-only).
Lanes: people | revenue | smalltalk | mixed. Exhaustive switch with a never default.

routeChatLane({ message, history }):
1. Score the latest user message with closed people vs revenue lexicons. Do not treat tool names (search_employees, update_employee, …) as people signals.
2. Both scores → mixed. People only → people. Revenue only → revenue.
3. Greeting / identity-only (short hi/thanks/who-are-you) with no domain nouns → smalltalk.
4. Else sticky: walk prior user turns newest-first, skip smalltalk, reuse last people/revenue/mixed.
5. Else mixed (fail open so a named person without lexicon still gets tools).

Bare "pipeline" → mixed. Candidate/job/stage/shortlist + pipeline → people. Lead/inbox/sales/deal + pipeline → revenue.

toolsForLane: people/mixed → the five existing G2+G3 names; revenue/smalltalk → [].
Wire app/api/chat/route.ts and lib/chat/openai.ts so the tool loop is skipped when the list is empty.
buildAnalystSystemPrompt(ctx, { lane = "mixed" }): people/mixed keep call-tool RULES; revenue/smalltalk do not instruct People tool calls. Read-only / no-email / no-hire fragments always stay.

User text cannot add tools. Routing never authorizes a mutation. No new tools. No n8n. No migration.
```

---

### J1 — Embed People summaries (and read that kind)

**Goal:** Write compact no-PII People summaries into the existing `embeddings` table as `kind=people_summary`, and retrieve that kind from Chat on people/mixed lanes only. Do not write a kind that no feature reads.

**Reuse:** [`lib/embeddings/store.ts`](lib/embeddings/store.ts) `matchKnowledge` / `upsertSummaryEmbedding`, [`lib/chat/analyst-context.ts`](lib/chat/analyst-context.ts), [`lib/chat/route-lane.ts`](lib/chat/route-lane.ts), G2 projection (names/roles/skills/scores — never email, phone, notes, URLs), persist paths in `lib/people/employees.ts`, `jobs.ts`, `candidates.ts`, match worker in `lib/people/match-worker.ts`.

**In scope:** Additive CHECK on `embeddings.kind`; formatters; fire-and-forget upsert on employee/job/candidate persist; batched upsert after match score/explain; lane-aware `matchKnowledge` kinds; Chat/UI People labels; n8n match-embeddings stays on `business_doc|summary|conversation`.

**Out of scope:** new Chat tools, n8n workflows (K1), hardening audit (L1), a second vector store, embedding notes/email/phone/CVs, a backfill UI, a new `background_jobs` kind.

**Verify:** `npm run test:people-summaries`, `npm run test:knowledge`, `npm run test:prompt-injection`, `npm run test:match-embeddings`, `npm run test:chat-analyst`, `npm run test:chat-router`, `npm run test:people-match-worker`, `npm run test:people-employees`, `npm run test:people-jobs`, `npm run test:people-candidates`, `npm run lint`, `npm run build`.

**Prompt:**

```text
Implement partition J1 only.

Add people_summary to embeddings.kind (additive CHECK). Chat people/mixed lanes retrieve it; revenue/smalltalk and n8n match-embeddings do not.

Deterministic no-PII summaries on employee/job/candidate persist and on match-worker writes. Best-effort; mutations never fail because embed failed. Archive deletes that source's people_summary row.

No new tools, no n8n workflow, no second vector store.
```

---

### K1 — n8n triggers calling Nexus APIs

**Goal:** A thin n8n schedule POSTs the existing People job-run endpoint so queued `people.match` work drains. Scoring, explanations, and approval stay in Nexus.

**Reuse:** [`n8n_logic/exports/wf4_followup_scheduler.json`](n8n_logic/exports/wf4_followup_scheduler.json) (Sticky Note + Schedule + HTTP), [`app/api/internal/people/jobs/run/route.ts`](app/api/internal/people/jobs/run/route.ts) (`requireN8nBootstrapToken`), n8n Variables `NEXUS_APP_URL` + `N8N_BOOTSTRAP_TOKEN` / `N8N_INGEST_TOKEN`.

**In scope:** Hand-authored export `n8n_logic/exports/wf9_people_match_drain.json`; static contract test; live n8n create + publish; docs (exports README, n8n env, MANUAL_ACTIONS).

**Out of scope:** L1 hardening, new APIs/migrations, Vercel cron, Trigger.dev, app→n8n webhook after enqueue, scoring/OpenAI/Supabase REST in n8n, Chat/People UI.

**Verify:** `npm run test:people-n8n-drain`, `npm run test:people-background-jobs`, `npm run lint`, `npm run build`.

**Prompt:**

```text
Implement partition K1 only.

Clone WF4 as WF9 People Match Drain: schedule every 15 minutes → POST
{NEXUS_APP_URL}/api/internal/people/jobs/run with Bearer
$vars.N8N_BOOTSTRAP_TOKEN (legacy N8N_INGEST_TOKEN). Body { limit: 5 }.
HTTP timeout 300s. neverError true. Sticky note: n8n must not compute
scores, call OpenAI, or use Supabase service-role.

Do not rename the run path. Do not add Trigger.dev or a Vercel cron.
Do not add an app webhook after enqueue. Policy and scoring stay in Nexus.
```

---

### L1 — Production hardening audit

**Goal:** Close People-domain production holes: RLS grants, CSV/retention, prompt-injection canaries, People AI cost caps.

**Reuse:** [`lib/csv/serialize.ts`](lib/csv/serialize.ts), [`lib/people/employee-csv.ts`](lib/people/employee-csv.ts) export, [`lib/ai/provider.ts`](lib/ai/provider.ts) `recordAiUsage`, [`business_profiles.ai_monthly_token_budget`](supabase/migrations/20260715150000_workspace_ai_settings.sql).

**In scope:** Additive grant/policy tightening (archive-only; no TRUNCATE); candidate CSV export; People AI hard-stop when monthly budget is set and exceeded; injection canaries.

**Out of scope:** Revenue/Chat/n8n rewrites, GDPR hard-delete, blocking Chat or Gmail/Meta send, Trigger.dev, editing old SQL files.

**Verify:** `npm run test:people-hardening`, `npm run test:people-candidates-csv`, `npm run test:people-match-worker`, `npm run test:people-email`, `npm run test:prompt-injection`, `npm run lint`, `npm run build`.

**Prompt:**

```text
Implement partition L1 only.

People production hardening: RLS grants, CSV/retention, prompt-injection canaries, People AI cost caps.

1. Additive migration: revoke TRUNCATE/DELETE extras from authenticated on People-era tables; drop DELETE policies on employees/jobs/candidates/candidate_jobs/people_message_drafts. Archive-only. Do not edit old SQL files.
2. Candidate CSV export mirroring employee export (serializeCsv, formula escape, tenant + archived filters). Formula canary on candidate import.
3. Hard-stop people_explain, email_draft, people_summary embed when ai_monthly_token_budget is set and current-month ai_usage >= budget. NULL budget = no cap. Scores, CSV, Chat, Revenue send stay unblocked. Match worker must not fail the job because explain was skipped.
4. Do not add Chat tools, n8n workflows, hard-delete APIs, or organization_id.

Hosted apply via Supabase MCP on xuvodbcdmfhlbldbvwvt. Tick L1 after verify.
```

---

## 13. Future partitions (do not run until Wave 1 is done)

These replace incoming Phases 6–12. Each must still be a **separate** conversation.

| ID | Name | Note |
|----|------|------|
| G2 | People read tools in Chat | Only if G1 Q&A is insufficient |
| G3 | Confirmation-gated People tools | Action metadata in code; never in the prompt |
| H1 | CandidateSource adapter | Interface only |
| H2 | One consented source | Not GitHub scrape-by-default; human picks the source |
| I1 | Mini-router | people vs revenue vs small-talk — still no mega-tools |
| J1 | Knowledge: embed People summaries | Only when a feature reads `kind` |
| K1 | n8n triggers calling Nexus APIs | Approval checkpoints stay in Nexus |
| L1 | Production hardening audit | RLS, CSV, prompt injection, retention, cost caps |

---

## 14. Testing strategy

- Pure: CSV, scoring, weight validation, approval-like people send policy.
- Route: mock Supabase like `approval_route.test.ts`.
- RLS: SQL assertions + at least one test that a second team_id cannot read.
- Chat: prompt-injection tests whenever Chat context grows.
- `npm run test:gate` before calling a wave done (build is included).

Add npm scripts for each new `scripts/*.test.ts` and append **fast** ones to `test:gate` when they do not need network.

---

## 15. Human actions (not agent)

Tick these in the **Build checklist** Human section when done.

- Apply Wave 1 migrations on hosted Supabase.
- Private `people-imports` bucket only if B4 stores files (B4 default is in-memory + 1 MB cap).
- After D1: cron that POSTs the People job-run endpoint. Prefer an existing n8n schedule or Vercel cron; do not add Trigger.dev. **Done K1 2026-09-03** — live WF9 `d1CkkuSDwsZKVhQq` every 15 min → `POST /api/internal/people/jobs/run`.
- GitHub / public discovery stays Wave 2 (H2) and needs a consent review before any code.

---

## 16. Locked decisions (do not re-ask)

1. **Salary:** do not add salary columns in Wave 1 (A2 or later Wave 1 partitions).
2. **Workspace:** People uses the workspace `requireApiTenantContext()` already returns (first workspace). No workspace switcher in B2.
3. **People email transport (F2):** use connected Gmail send if the tenant has it; otherwise the generic SMTP mailbox. Inspect existing send helpers; do not invent a third transport.
4. **Background jobs:** Postgres `background_jobs` table (D1), modeled on `gmail_backfill_jobs`. Not Trigger.dev.
5. **CSV:** one shared parser (B3). Employee import in B4; candidate import in C3. Not a generic ETL platform.

---

## DONE criteria for the *plan* work (this document)

- Wave 1 scope is locked in the Build checklist. Agents tick boxes there; they do not invent a second plan.
