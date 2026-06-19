<div align="center">

```
    ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗     ██████╗ ███████╗
    ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝    ██╔═══██╗██╔════╝
    ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗    ██║   ██║███████╗
    ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║    ██║   ██║╚════██║
    ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║    ╚██████╔╝███████║
    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝     ╚═════╝ ╚══════╝
```

# Nexus OS — Revenue Command Center

**AI-powered operational layer that prevents revenue leakage and customer churn.**

[![MVP](https://img.shields.io/badge/status-MVP%20complete-0ea5e9?style=flat-square)]()
[![n8n Track Winner](https://img.shields.io/badge/Cursor%20Colombo%20Buildathon-n8n%20Track%20Winner-f97316?style=flat-square)]()
[![Next.js](https://img.shields.io/badge/Next.js-14.2-000?style=flat-square&logo=next.js)]()
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%2B%20RLS-3ecf8e?style=flat-square&logo=supabase)]()
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?style=flat-square&logo=openai)]()

*Slow responses kill conversion. Nexus OS monitors your inbox, classifies every message with AI, drafts replies in seconds, and routes high-stakes responses through a founder approval queue—so revenue and relationships are never left on read.*

**Built for [Cursor Colombo Buildathon](https://cursor.com) (n8n Track) · Winner, n8n Track Award · Converting to multi-tenant SaaS**

[Features](#features) · [How It Works](#how-it-works) · [Architecture](#architecture) · [Getting Started](#getting-started) · [Roadmap](#roadmap)

</div>

---

## Table of Contents

- [The Problem](#the-problem)
- [Features](#features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Development Guide](#development-guide)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Performance & Metrics](#performance--metrics)
- [Security](#security)
- [FAQ](#faq)
- [Acknowledgments](#acknowledgments)
- [License](#license)
- [Contact & Support](#contact--support)

---

## The Problem

Businesses lose revenue because responses are slow. A pricing inquiry waits six hours. A frustrated customer emails twice with no reply. A hot lead goes cold while the founder is in meetings.

Nexus OS is the **Revenue Command Center** between your inbox and your team: it ingests real Gmail traffic, filters noise without burning API credits, classifies intent and churn risk with GPT-4o, drafts on-brand replies, and surfaces everything on an executive dashboard—**with human approval before anything sends**.

**Outcomes teams care about:**

- ⚡ **Faster response cycles** — from intake to draft in under a minute for classified messages
- 💰 **Revenue visibility** — quantified revenue at risk, hot leads, and rescue opportunities
- 🔒 **Tenant-safe by design** — Supabase Row Level Security isolates every workspace

---

## Features

### 💰 Revenue Protection

| | Feature | What it does | Business outcome |
|---|---------|--------------|------------------|
| 📬 | **Gmail IMAP Integration** | Real-time inbox monitoring via n8n IMAP trigger + webhook fallback | No synthetic demos—work with live customer email |
| 🧠 | **Intelligent AI Classification** | GPT-4o extracts intent, urgency, estimated value, churn signals | Prioritize the inbox that actually moves revenue |
| 💰 | **Revenue at Risk Dashboard** | Command Center metrics: leakage, hot leads, hours saved | Executives see dollars, not ticket counts |
| 📊 | **Daily Buy-Back Report** | WF4 aggregates rescued revenue and efficiency (WF4 workflow) | Weekly proof of ROI for founders and investors |

### 🛡️ Customer Retention

| | Feature | What it does | Business outcome |
|---|---------|--------------|------------------|
| 🚨 | **Churn Detection** | Flags `churn_risk`, negative sentiment, complaint patterns | Intervene before cancellation, not after |
| ✍️ | **AI Reply Drafting** | Contextual drafts from `ai_prompts/reply_generation_prompt.txt` | Empathetic, on-brand responses in seconds |
| ✅ | **Founder Approval Queue** | Approve, edit, or reject before send (`/approval`) | Brand safety + human judgment on high-stakes replies |

### ⚙️ Operational Efficiency

| | Feature | What it does | Business outcome |
|---|---------|--------------|------------------|
| 🧹 | **Zero-Cost Spam Filtering** | String-based `noise_filter.js` pre-filter (no OpenAI) | Eliminates wasted API calls on newsletters and auto-replies |
| 🔄 | **n8n Orchestration** | 5 workflows, 50+ nodes on n8n Cloud | Visual ops layer your team can audit and extend |
| 🏢 | **Multi-Tenant Architecture** | `teams` → `workspaces` → RLS via `team_id` / `workspace_id` | SaaS-ready isolation without rewriting the app |

> **Screenshots:** Add dashboard, inbox, and approval queue captures under `docs/screenshots/` when available.

---

## How It Works

Five-stage pipeline from inbox to send:

```
┌─────────────┐    ┌────────────────┐    ┌─────────────────┐    ┌──────────────┐    ┌──────────────┐
│   INTAKE    │───▶│ CLASSIFICATION │───▶│   GENERATION    │───▶│   APPROVAL   │───▶│     SYNC     │
│  WF0a Gmail │    │  WF2 GPT-4o    │    │  WF3 Reply Agent│    │  Dashboard   │    │  Gmail / CRM │
│  + Noise    │    │  + Leads DB    │    │  reply_drafts   │    │  /api/approval│   │  (n8n WF5)   │
└─────────────┘    └────────────────┘    └─────────────────┘    └──────────────┘    └──────────────┘
```

| Stage | System | What happens |
|-------|--------|----------------|
| **1. Intake** | `WF0a Gmail Intake` | IMAP or webhook receives mail → tenant routing via `business_profiles` → normalizer → noise filter → dedup → conversation row in Supabase |
| **2. Classification** | `WF2 - AI Classification` | GPT-4o classifies intent, urgency, revenue risk, churn signals → upserts `leads` + logs to `workflow_logs` |
| **3. Generation** | `WF3 Reply Agent` | Drafts contextual reply → `reply_drafts` with `pending_approval` |
| **4. Approval** | Next.js `/approval` | Founder reviews, edits, approves or rejects → triggers n8n approval webhook |
| **5. Sync** | n8n send workflow | Approved drafts dispatch via configured channel; status flows back to `conversations` |

**Real-time path:** Supabase Realtime + React Query keep the Command Center (`/dashboard`), Inbox (`/inbox`), and Logs (`/logs`) current without manual refresh.

---

## Architecture

### System overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           FOUNDER / OPERATOR                                  │
└──────────────────────────────────────────────────────────────────────────────┘
         │                                    ▲
         ▼                                    │
┌─────────────────────┐              ┌─────────────────────┐
│   Next.js 14 App    │◄──Realtime──▶│      Supabase       │
│   (App Router)      │   REST/Auth  │  PostgreSQL + RLS   │
│  dashboard/inbox/   │              │  teams · workspaces │
│  approval/signup    │              │  conversations ·    │
└──────────┬──────────┘              │  leads · drafts     │
           │                           └──────────┬──────────┘
           │ /api/internal/n8n/*                  │
           │ (optional ingest token)              │ REST
           ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────┐
│     n8n Cloud       │──────────────│      OpenAI API     │
│  WF0a · WF2 · WF3   │   GPT-4o     │  Classification +   │
│  WF4 · WF1          │              │  Reply generation   │
└──────────┬──────────┘              └─────────────────────┘
           │
           ▼
┌─────────────────────┐
│   Gmail (IMAP)      │
│   Webhook ingress   │
└─────────────────────┘
```

### Multi-tenant data model

| Entity | Purpose |
|--------|---------|
| `teams` | Top-level tenant root; all operational rows carry `team_id` |
| `workspaces` | Product workspace (solo/team); linked 1:1 to a team in the current model |
| `profiles` | Auth user ↔ `team_id` binding (immutable after assignment) |
| `business_profiles` | Tone, services, approval mode + **integration routing** (`gmail_destination_email`, webhook tokens) |
| `conversations` | Raw inbound messages (`source`: `gmail`, `imap`, `webhook`, …) |
| `leads` | AI classification output: intent, urgency, `estimated_value`, `risk_score` |
| `reply_drafts` | Generated replies awaiting approval |
| `workflow_logs` | Auditable n8n step trail per team |
| `daily_reports` | Aggregated hours saved / revenue rescued |

**RLS:** Policies scope reads and writes to the authenticated user's `team_id` (via `private.current_team_id()` helpers). API routes add defense-in-depth with `requireApiTenantContext()` before any mutation.

**Tenant routing (n8n):** Inbound items resolve `business_profiles` by webhook token → WhatsApp routing number → Gmail destination mailbox (see migration `0012_business_profiles_integration_routing.sql`).

---

## Tech Stack

| Layer | Technology | Version (repo) | Why |
|-------|------------|----------------|-----|
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind CSS | Next `14.2.35`, React `18`, TS `5` | SSR + API routes in one deployable surface; type-safe UI |
| **UI motion** | Framer Motion, Lenis, Three.js (landing) | — | "Atmospheric Executive" dark glass aesthetic |
| **Backend** | Supabase (Postgres, Auth, Realtime) | `@supabase/supabase-js` `2.x` | Managed Postgres + RLS for multi-tenant SaaS |
| **Automation** | n8n Cloud | 5 workflows, 50+ nodes | Visual orchestration; non-devs can audit flows |
| **AI** | OpenAI GPT-4o | `openai` `6.x` | Classification + reply generation with structured JSON |
| **Hosting** | Vercel / Netlify (configured) | `netlify.toml` present | Edge-friendly Next.js deploy |

---

## Getting Started

**Estimated setup time:** 15–20 minutes (Supabase + n8n credentials assumed).

### Prerequisites

- **Node.js** 18+ (20 recommended)
- **npm** 9+
- **Supabase** project ([supabase.com](https://supabase.com))
- **n8n Cloud** account ([n8n.io](https://n8n.io)) or self-hosted n8n
- **OpenAI API key** with GPT-4o access
- **Gmail account** with IMAP enabled (for live intake)
- **Docker** (optional, for local Supabase CLI)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_ORG/nexus-os.git
cd nexus-os
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see [Configuration](#configuration)).

### 3. Supabase database

Apply migrations in order from `supabase/migrations/`:

```bash
# With Supabase CLI linked to your project:
supabase db push

# Or run SQL files manually in the Supabase SQL editor (0001 → latest).
```

Enable **Realtime** on tables your dashboard subscribes to (`conversations`, `leads`, `reply_drafts` as needed).

### 4. n8n workflows

```bash
# Regenerate importable workflow JSON from repo logic:
npm run n8n:export-workflows
```

1. Import `n8n_logic/exports/wf0a_gmail_intake.json` into n8n Cloud.
2. Configure **Supabase** credential (service role for writes).
3. Configure **Gmail IMAP** credential on the IMAP trigger (enable the node when ready).
4. Set n8n environment variables per [`docs/n8n_workspace_env.md`](docs/n8n_workspace_env.md).
5. Deploy **WF2**, **WF3**, **WF4**, and intake helpers from `n8n_logic/workflow_*.js` (copy Code node bodies into your cloud workflows or import from your team's n8n instance).

Wire WF0a's HTTP nodes to your Supabase REST URL and WF2 webhook URL.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → complete **signup/onboarding** → connect Gmail via onboarding (`/api/gmail/test-imap` validates IMAP with encrypted credentials).

### Troubleshooting

| Issue | Fix |
|-------|-----|
| `Unauthorized` on API routes | Sign in via Supabase Auth; ensure `profiles.team_id` is set after onboarding |
| Login shows "Too many requests" (429) | Supabase Auth rate limit. The login UI now throttles retries with a cooldown; for legitimate volume, raise limits and add SMTP (see [Supabase Auth rate limits](#supabase-auth-rate-limits)) |
| Signup shows "We could not send the verification email" | Run `npm run check:auth-email`. If SMTP credentials changed, set the `SUPABASE_SMTP_*` variables locally and run `npm run fix:auth-email`. |
| IMAP test fails | Set `ENCRYPTION_KEY` (32+ chars); restart `next dev`; verify Gmail app password |
| n8n writes wrong tenant | Align `NEXUS_GMAIL_DESTINATION_MAILBOX` with `business_profiles.gmail_destination_email` |
| No dashboard data | Confirm WF0a → WF2 chain executed; check `workflow_logs` in Supabase |
| Classification errors | Run `npm run test:classify` with `OPENAI_API_KEY` set |

---

## Configuration

### `.env.local` reference

```bash
# Supabase (public — safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_SITE_URL=https://your-production-origin.com

# Server-only
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Supabase Management API for auth-email checks and repair scripts
SUPABASE_ACCESS_TOKEN=sbp_...
SUPABASE_PROJECT_REF=xuvodbcdmfhlbldbvwvt

# Supabase Auth email delivery
SUPABASE_AUTH_SITE_URL=https://your-production-origin.com
SUPABASE_AUTH_REDIRECT_URLS=https://preview.example.com/auth/callback/**,https://staging.example.com/auth/callback/**
SUPABASE_AUTH_EMAIL_RATE_LIMIT=100
SUPABASE_AUTH_DISABLE_SEND_EMAIL_HOOK=true
SUPABASE_SMTP_ADMIN_EMAIL=no-reply@your-domain.com
SUPABASE_SMTP_HOST=smtp.your-provider.com
SUPABASE_SMTP_PORT=587
SUPABASE_SMTP_USER=your_smtp_user
SUPABASE_SMTP_PASS=your_smtp_password_or_api_key
SUPABASE_SMTP_SENDER_NAME=Nexus OS

# AES-256 key material for Gmail IMAP password storage (32+ characters)
ENCRYPTION_KEY=your_long_random_secret

# Optional: secure n8n → Next.js ingest (/api/internal/n8n/*)
N8N_INGEST_TOKEN=your_shared_secret

# Optional: approval workflow webhook base (no trailing slash)
# N8N_WEBHOOK_BASE_URL=https://your-instance.app.n8n.cloud

# Optional: OpenAI from Next.js scripts (classification smoke tests)
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-4o
```

### n8n environment (tenant routing)

| Variable | Purpose |
|----------|---------|
| `NEXUS_GMAIL_DESTINATION_MAILBOX` | Fallback Gmail routing address (lowercase) |
| `NEXUS_WHATSAPP_DESTINATION_NUMBER` | WhatsApp routing fallback |
| `NEXUS_WHATSAPP_TOKEN_HEADER` | Webhook token header name (default `x-nexus-webhook-token`) |
| `NEXUS_WORKSPACE_ID` | Fallback UUID when profile has no `workspace_id` |
| `OPENAI_API_KEY` | GPT-4o in WF2 / WF3 nodes |

Full reference: [`docs/n8n_workspace_env.md`](docs/n8n_workspace_env.md).

### OpenAI

- **Model:** `gpt-4o` (set `OPENAI_MODEL=gpt-4o` for local tests).
- **Prompts:** `ai_prompts/classification_prompt.txt`, `ai_prompts/reply_generation_prompt.txt`.
- **Validate locally:** `npm run test:classify` (5 scenario harness; see [`docs/classification_test_results_v1.md`](docs/classification_test_results_v1.md)).

### Supabase RLS

- Migrations through `0008`, `0010`, `0011`, and `future_migrations/0011_production_rls_hardening.sql` harden production policies.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client bundle.

### Supabase Auth rate limits

Login surfaces an HTTP 429 ("Too many requests") when Supabase Auth (GoTrue) rate-limits sign-in or magic-link requests. The client already throttles retries (cooldown + exponential backoff in `app/login/page.tsx`), but if you legitimately hit the cap:

- **Raise auth limits:** Supabase Dashboard → Authentication → Rate Limits. Increase token/sign-in and OTP/email limits to match expected traffic. GoTrue limits are **per IP**, so users behind a shared NAT / corporate egress IP (common in production) share one bucket and can collectively exhaust it — raise the limits accordingly.
- **Add custom SMTP:** Supabase Dashboard → Authentication → Emails (SMTP Settings). The default shared mailer caps magic-link emails very low (a few per hour); a custom SMTP provider lifts this and is required for production magic-link / OTP volume.
- **Prefer password auth** for high-frequency sign-ins; reserve magic links for recovery to avoid the email cap.

### Supabase Auth email delivery

Signup email delivery depends on Supabase Auth config and the SMTP provider accepting the message. Use these commands whenever signup reports a verification-email failure:

```bash
npm run check:auth-email
npm run fix:auth-email
```

`check:auth-email` reads the live Supabase Auth config through the Management API and prints a redacted health report: email provider status, confirmation requirement, SMTP field presence, Send Email Hook status, Site URL, redirect allowlist, and `rate_limit_email_sent`.

`fix:auth-email` keeps verified-email signup enabled, sets the email-send limit to `100`, applies the Site URL and redirect allowlist, and disables an accidental Send Email Hook by default. It only patches SMTP when all `SUPABASE_SMTP_*` variables are present, so a half-filled credential set cannot overwrite a working provider.

After changing SMTP, confirm the provider-side sender/domain authentication in your email service, then run one fresh signup and check the provider delivery logs before retrying production signups.

#### Email confirmation auto-login

Clicking the confirmation email link hits `/auth/callback`, which exchanges the code for a session and redirects back into the signup wizard (`/signup`). The wizard's `reconcile()` then auto-advances to workspace setup — **no separate manual login is required**. This avoids stacking an extra sign-in token call on top of the callback's session exchange, which previously contributed to first-login 429s. The confirmation link must be opened in the **same browser** that started signup (PKCE `code_verifier` is stored locally); if it fails, the callback redirects to `/login?error=...` and the login page now surfaces that message.

---

## Usage

### Quick start: first classified message

1. Complete onboarding at `/signup` and `/onboarding`.
2. Send a test email to your configured Gmail inbox (or POST to the WF0a webhook fixture).
3. Open **Dashboard** (`/dashboard`) — confirm conversation + lead appear.
4. Open **Approval** (`/approval`) — review the AI draft.
5. **Approve** or **Reject** — action logs to `workflow_logs` and triggers n8n when `N8N_WEBHOOK_BASE_URL` is set.

### Dashboard

- **Revenue at risk** — unresolved high-urgency / high-risk threads
- **Hot leads** — high `estimated_value` or `lead_score`
- **Hours saved** — operational efficiency metric (also in daily reports)

### Admin: approval queue

`POST /api/approval` with `{ "draft_id": "...", "action": "approve" | "reject", "draft_text": "..." }` (session cookie required). Rejection can include `rejection_reason`.

### API & webhooks

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET/POST /api/conversations` | User session | List / ingest conversations |
| `GET /api/leads` | User session | Classified leads |
| `GET /api/reply-drafts` | User session | Pending drafts |
| `POST /api/approval` | User session | Approve / reject draft |
| `GET /api/metrics` | User session | Dashboard aggregates |
| `POST /api/internal/n8n/conversations` | `N8N_INGEST_TOKEN` | Alternative n8n ingest |
| `POST /api/internal/n8n/workflow-logs` | `N8N_INGEST_TOKEN` | Workflow audit ingest |
| `POST /api/gmail/test-imap` | User session | Validate Gmail credentials |
| `GET /api/meta/connect` | User session | Start Meta OAuth (WhatsApp / Instagram / Facebook) |
| `GET /api/meta/callback` | User session | Meta OAuth callback (encrypt tokens, sync routing keys) |
| `GET /api/meta/status` | User session | Meta connection status per platform |
| `GET/POST /api/meta/webhook` | Meta verify token + HMAC signature | Unified Meta webhook → forward to n8n intake |
| `GET/POST /api/internal/n8n/meta-credentials` | `N8N_INGEST_TOKEN` | Decrypted Meta page tokens for n8n send workflows |

n8n webhooks (configure in your instance): `/webhook/gmail-inbound` (Gmail + Meta forwarded payloads), `/webhook/approval-trigger`.

### Meta unified inbox

WhatsApp Business, Instagram DMs, and Facebook Messenger share one Meta app webhook at `{NEXT_PUBLIC_SITE_URL}/api/meta/webhook`. Next.js verifies the handshake and `X-Hub-Signature-256`, dedupes by message id, returns HTTP 200 quickly, and forwards the raw payload to `{N8N_WEBHOOK_BASE_URL}/webhook/gmail-inbound` so messages flow through the same tenant routing → noise filter → WF2 classify → WF3 reply → approval pipeline as Gmail.

**Connect:** `GET /api/meta/connect` (Facebook Login for Business). Callback stores encrypted tokens in `meta_credentials` and syncs `ig_account_id`, `fb_page_id`, `wa_phone_number_id` on `business_profiles`.

**Manual Meta dashboard steps:** Create a Meta app → add WhatsApp, Instagram, and Messenger products → set webhook URL and verify token → subscribe to `messages` fields → add testers (≤25 before App Review) → request production permissions (`whatsapp_business_messaging`, `instagram_business_manage_messages`, `pages_messaging`, etc.).

See `docs/meta_unified_inbox.md` for verification commands and test payloads.

---

## Project Structure

```
nexus-os/
├── app/                      # Next.js App Router
│   ├── dashboard/            # Revenue Command Center
│   ├── inbox/                # Conversation list
│   ├── approval/             # Founder approval queue
│   ├── logs/                 # Workflow execution log
│   ├── signup/               # Multi-step tenant onboarding
│   └── api/                  # REST routes (conversations, approval, metrics, …)
├── components/               # UI shell, auth, signup steps
├── lib/                      # Supabase clients, queries, encryption, API security
├── ai_prompts/               # GPT-4o classification & reply prompts
├── n8n_logic/                # Code nodes + workflow exports
│   ├── exports/              # Importable n8n JSON (WF0a)
│   ├── noise_filter.js       # Zero-cost pre-filter
│   ├── workflow_2_classification.js
│   ├── workflow_3_agent.js
│   └── workflow_4_buy_back_report.js
├── supabase/migrations/      # Schema + RLS (source of truth)
├── scripts/                  # Tests, n8n export builder, seed utilities
└── docs/                     # n8n env, classification results, Gmail tests
```

| Looking for… | Location |
|--------------|----------|
| Dashboard UI | `app/dashboard/page.tsx`, `app/components/CommandCenter.tsx` |
| Approval flow | `app/approval/page.tsx`, `app/api/approval/route.ts` |
| Tenant scope | `components/tenant/TenantScope.tsx`, `lib/api-security.ts` |
| DB schema | `supabase/migrations/0001_initial_schema.sql` + later migrations |
| n8n intake export | `n8n_logic/exports/wf0a_gmail_intake.json` |

---

## Development Guide

### Extend the pipeline

1. **New workflow stage** — Add a Code node file under `n8n_logic/`, register in `scripts/build_n8n_workflow_exports.js`, export, import to n8n.
2. **New channel (WhatsApp, Slack)** — Extend `multi_channel_normalizer.js` + `business_profiles` routing columns; add destination env vars.
3. **Custom classification** — Edit `ai_prompts/classification_prompt.txt`, run `npm run test:classify:doc` to refresh docs.

### Scripts

```bash
npm run dev                    # Local Next.js
npm run lint                   # ESLint
npm run test:classify          # Classification prompt harness (5 cases)
npm run test:tenant-intake     # Tenant routing unit tests
npm run test:buy-back-report   # WF4 report logic
npm run n8n:export-workflows   # Regenerate n8n JSON exports
```

### Conventions

- **TypeScript** strict mode; path alias `@/*`
- **API routes** use `requireApiTenantContext()` for tenant mutations
- **n8n Code nodes** — copy from `// --- n8n entrypoint ---` sections; no hard-coded API keys
- **Commits** — focused PRs per feature; migrations numbered sequentially

### Testing approach

- **Prompt regression:** `npm run test:classify` (no network when using fixtures; set `OPENAI_API_KEY` for live runs)
- **Tenant routing:** `npm run test:tenant-intake`
- **Integration:** Manual WF0a → WF2 curl + Supabase row verification (see `docs/gmail_integration_test_results.md`)

---

## Deployment

### Production checklist

- [ ] All `supabase/migrations` applied to production project
- [ ] RLS enabled and verified with non-admin test users
- [ ] `ENCRYPTION_KEY` rotated and stored in host secrets (never commit)
- [ ] n8n workflows active; IMAP credential on production mailbox
- [ ] `N8N_WEBHOOK_BASE_URL` + `N8N_INGEST_TOKEN` set if using internal ingest
- [ ] OpenAI usage limits / billing alerts configured
- [ ] `npm run build` passes; deploy to Vercel or Netlify

### Recommended hosting

| Component | Host |
|-----------|------|
| Next.js | [Netlify](https://netlify.com) |
| Database / Auth | [Supabase](https://supabase.com) |
| Workflows | [n8n Cloud](https://n8n.io) |
| AI | [OpenAI API](https://platform.openai.com) |

### Scaling notes

- **Noise filter** reduces OpenAI spend linearly with inbox spam volume.
- **Dedup** in WF0a prevents duplicate lead creation on thread replies.
- **Rate limits** on API routes (`lib/api-security.ts`) protect approval and ingest endpoints.
- **Realtime** subscriptions — scope channels per `team_id` to avoid fan-out at high tenant counts.

---

## Contributing

We welcome issues and pull requests.

1. Fork the repository and create a feature branch (`feat/your-feature`).
2. Run `npm run lint` and relevant `npm run test:*` scripts.
3. Include migration files for schema changes under `supabase/migrations/`.
4. Open a PR with a clear description, screenshots for UI changes, and a test plan.

Please follow our [Code of Conduct](CODE_OF_CONDUCT.md) when participating (add file if not yet present).

---

## Roadmap

| Horizon | Items |
|---------|-------|
| **Near-term** | Multi-tenant SaaS billing (Dodo Payments hooks in `.env.example`), WhatsApp channel, custom model fine-tuning |
| **Medium-term** | Slack integration, advanced analytics, team collaboration / roles |
| **Long-term** | On-premise deployment bundle, custom AI training per tenant, integration marketplace |

---

## Performance & Metrics

Benchmarks from MVP / test harness (your production numbers will vary with inbox volume):

| Metric | Typical MVP range | Notes |
|--------|-------------------|-------|
| Intake → dashboard | **~30–90 s** | Depends on n8n polling / IMAP interval |
| Throughput | **100+ msgs/hr** | Limited by OpenAI rate limits and n8n concurrency |
| API cost per message | **↓ 40–70%** vs unfiltered | Noise filter drops newsletters, OOO, pleasantries before GPT-4o |
| Classification accuracy | **5/5 PASS** | Scripted scenarios in `docs/classification_test_results_v1.md` |

---

## Security

| Control | Implementation |
|---------|----------------|
| **Tenant isolation** | Supabase RLS on `team_id`; API `requireApiTenantContext()` |
| **Secrets** | Service role + `ENCRYPTION_KEY` server-only; never in `NEXT_PUBLIC_*` |
| **n8n ingest** | `N8N_INGEST_TOKEN` bearer on `/api/internal/n8n/*` |
| **Encryption at rest** | Supabase platform defaults (AES-256) |
| **Gmail credentials** | Encrypted at application layer before storage |
| **GDPR** | Data processor agreements with Supabase, OpenAI, n8n; implement retention policies per tenant contract |

Rotate keys on team member offboarding. Use separate Supabase projects for staging vs production.

---

## Acknowledgments

**Core team** (Cursor Colombo Buildathon, n8n Track):

| Contributor | Focus |
|-------------|-------|
| **Senuka Deneth** | Automations, Backend |
| **Mahinsa Wattegedara** | UI/UX design |
| **Praveen Ramanathan** | Database Management, Backend |
| **Vinuth Karunathilaka** | Model Fine-tuning |

**Community & partners**

- [Cursor](https://cursor.com) — Cursor Colombo Buildathon organizers
- [TechTalk360](https://techtalk360.com/) — Buildathon ecosystem
- [n8n](https://n8n.io) — Workflow automation platform & track sponsor
- [OpenAI](https://openai.com) — GPT-4o classification and generation APIs

---

## Contact & Support

| Channel | Link |
|---------|------|
| **Bug reports** | [GitHub Issues](https://github.com/YOUR_ORG/nexus-os/issues) |
| **Feature requests** | Open an issue with label `enhancement` |
| **Discussions** | GitHub Discussions (enable in repo settings) |

Replace `YOUR_ORG` with your GitHub organization before publishing.

---

<div align="center">

**Nexus OS** — *Turn every inbox message into revenue signal.*

⚡ Fast · 💰 Measurable · 🔒 Tenant-safe

</div>
