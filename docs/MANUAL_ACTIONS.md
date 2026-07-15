# Manual actions — what the founder/operator must do by hand

> Generated 2026-07-15 after the security-hardening + feature pass (durable rate limiting,
> posts-webhook lockdown, RAG quality, Meta outbound behind kill-switch, AI budgets, chat
> visuals). This file also absorbs the still-open operational items from the deleted
> `TEAM_BUILD_CHECKLIST.md` (recoverable via git history if you need the full forensic log).

## 1. Environment variables (Vercel / hosting)

Set (server-only — never `NEXT_PUBLIC_*`):

| Var | Value / purpose |
|---|---|
| `N8N_WEBHOOK_BASE_URL` | `https://knurdz3o.app.n8n.cloud` — base for approval + posts proxies |
| `N8N_SOCIAL_POST_INPUT_WEBHOOK_URL` | optional override; defaults to `<base>/webhook/social-post-input` |
| `N8N_GENERATE_POST_IMAGE_WEBHOOK_URL` | optional override; defaults to `<base>/webhook/generate-post-image` |
| `META_SEND_ENABLED` | **leave unset** until Meta App Review passes; then set `true` to go live |
| `META_HUMAN_AGENT_ENABLED` | `true` only after Meta grants the Human Agent permission |
| `META_WA_TEMPLATE_NAME` / `META_WA_TEMPLATE_LANG` | approved WhatsApp template for out-of-24h sends (see §4) |
| `RAG_MIN_SIMILARITY` | optional; retrieval floor, default 0.25 |

Remove (now unused — the browser no longer calls n8n directly):

- `NEXT_PUBLIC_SOCIAL_POST_INPUT_WEBHOOK`
- `NEXT_PUBLIC_GENERATE_POST_IMAGE_WEBHOOK`

## 2. Supabase — already applied via MCP (verify only)

These migrations were **applied to the live project (`xuvodbcdmfhlbldbvwvt`) during this pass**
and committed under `supabase/migrations/`. Nothing to run — just be aware:

- `20260715130000_security_hardening_policies_and_functions.sql` — `org_insert` scoped to
  `auth.uid()`, `search_path` pinned, RPC execute revokes (launch blockers #6/#8 cleared;
  confirmed via security advisors).
- `20260715131000_revoke_public_execute_trigger_fns.sql` — PUBLIC-grant revokes on trigger fns.
- `20260715140000_durable_rate_limit.sql` — `rate_limit_hit` RPC (service-role only).
- `20260715150000_workspace_ai_settings.sql` — `ai_monthly_token_budget`, `chat_visuals_enabled`.
- `20260715160000_reply_drafts_provider_message_id.sql`.

Still yours to decide/do in the Supabase dashboard:

- [ ] **Enable leaked-password protection** (Auth → Passwords → HaveIBeenPwned check).
- [ ] **Move the `vector` extension out of `public`** (advisor WARN; low urgency, coordinate
      with the `embeddings` table + `match_embeddings` before touching).
- [ ] Advisors still list `invite_preview`, `launch_workspace`, `is_workspace_member/owner`,
      `get_user_team_id`, `get_user_organization_id` as anon/authenticated-callable DEFINER
      functions — these are **intentional** (signup/invite flows + RLS helpers, all
      self-scoped). No action unless you change those flows.

## 3. n8n (instance `knurdz3o.app.n8n.cloud`)

Live workflow IDs (from the 2026-07-11 audit; kept here since they exist nowhere else):

| WF | ID | | WF | ID |
|---|---|---|---|---|
| WF0a Gmail intake | `bhGCrTSHrj91ojby` | | WF3 Revenue rescue | `OjFlX2W2xYbl5roY` |
| WF0d Ledger drain | `lr4HzWo2QeghXxhH` | | WF4 Buy-back report | `qWHvc2AmqX10jEjk` |
| WF0e Backfill | `Y54F1bZLJkRyexTH` | | WF5 Summary | `QoJIseLTX2jwDYEy` |
| WF0f Gmail sync poller | `rNjW8GyWfZHuXnnf` (INACTIVE) | | WF8b Social publish | `VZ9ZaA1S2JxSAeGQ` |
| WF1 Webhook intake | `zU8cDHJeoUGWbUgC` | | WF8c Image gen | `RfmuS0guiaq64Lrx` |
| WF2 Classification | `MmA7EKsOYAZgx3ep` | | WF8a orphan (Claude) | `YjEXyYnAHhoSSc2W` — delete when convenient |

To do:

- [ ] **Update WF3's Code node**: paste the updated body of `n8n_logic/workflow_3_agent.js`
      into WF3 (`OjFlX2W2xYbl5roY`) and publish — it now retrieves "similar past context" from
      `POST /api/internal/n8n/match-embeddings` before drafting (gracefully skipped when
      `NEXUS_APP_BASE_URL` / `N8N_INGEST_TOKEN` vars are unset, so pasting is safe now).
- [ ] **Set n8n Variables** (Settings → Variables): `NEXUS_APP_BASE_URL` (production app URL),
      `N8N_INGEST_TOKEN` (same value as the app env), and — still open from the previous pass —
      **`OPENAI_API_KEY`** once credits land (WF2/WF5/WF8c read `$vars.OPENAI_API_KEY`;
      classification is degraded until then). WF0e needs `NEXUS_APP_URL` + `NEXUS_INGEST_TOKEN`.
- [ ] **Activate WF0f** (gmail-sync poller) once the app is deployed to production.
- [ ] Decision (old flag): WF2 currently classifies via OpenRouter free tier in some configs vs
      GPT-4o per architecture — confirm the live model choice.

## 4. Meta — the only real blocker for outbound send

Code for WhatsApp/Messenger/Instagram outbound is **built and tested but disabled**
(`sendMetaMessage` returns 501 until `META_SEND_ENABLED=true`). To go live:

1. [ ] Pass **Meta App Review** for `whatsapp_business_messaging`, `pages_messaging`,
       `instagram_business_manage_messages` (+ **Human Agent** if you want the 7-day window).
2. [ ] Get at least **one WhatsApp message template approved** (used automatically outside the
       24h window); set `META_WA_TEMPLATE_NAME` / `META_WA_TEMPLATE_LANG`.
3. [ ] Set `META_SEND_ENABLED=true` (and `META_HUMAN_AGENT_ENABLED=true` if granted).
4. [ ] Run a sandbox E2E: approve a draft on a test WhatsApp conversation and verify
       `reply_drafts.provider_message_id` gets the `wamid`. Delivery-status webhooks are a
       documented follow-up (docs/meta_outbound.md §5) — not built yet.

## 5. Product/architecture decisions waiting on you

- [ ] **Tenancy unification ADR** (`docs/tenant_model_unification.md`) — sign off on the
      1:1 team↔organization bridge, then sync the remote-only `organizations`/`user_profiles`
      schema into local migrations before any bridge migration is written.
- [ ] **Deploy `development` → production** — `main` is far behind `development` (last audit:
      only through PR #115). None of this branch's work is live until deployed.
- [ ] Re-test signup + Gmail connect in Safari and Chrome on the production domain
      (old item 5.5 — ITP cookie path).
- [ ] Per-org image-generation daily cap is 25 (`app/api/posts/generate-image/route.ts`) —
      adjust if pricing changes.

## 6. New features shipped in this pass (nothing to do — just awareness)

- Durable Postgres rate limiting on credential/send/internal endpoints (falls back to
  in-memory if the RPC is unreachable).
- Posts caption/image generation now goes through authenticated server proxies.
- Analyst RAG: similarity floor + per-kind weighting + inline `[n]` citations with a sources
  row in the chat UI; WF3 drafting retrieves similar past context.
- Chat visuals: the analyst can render bar/line/donut/table blocks; toggle (default ON, with
  a usage note) in Settings → AI & Approval Rules.
- Per-tenant monthly AI token budget (soft alert only) + AI usage card on the Report page.
- Prompt-injection canary tests: `npm run test:prompt-injection`.
