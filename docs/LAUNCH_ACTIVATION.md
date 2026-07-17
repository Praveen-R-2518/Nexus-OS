# Launch activation runbook

Operator checklist to take Nexus OS from sandbox to live. Run steps in order; do not skip the pre-secret gate.

---

## 1. Pre-secret gate (no production credentials)

From repo root on a clean checkout:

```bash
npm ci
CHANNEL_SENDER_TRANSPORT=sandbox npm run test:gate
CHANNEL_SENDER_TRANSPORT=sandbox npm run test:send-e2e
```

All steps must pass before applying secrets or activating live sends.

---

## 2. Supabase migrations

Apply these migrations to the target project (in timestamp order; do not skip):

| Migration | Purpose |
|---|---|
| `20260709115700_daily_reports_wf_columns.sql` | Daily report WF columns |
| `20260709115800_create_organizations_user_profiles_foundation.sql` | Organizations + user_profiles |
| `20260717120000_teams_organization_id_bridge.sql` | `teams.organization_id` bridge |
| `20260717130000_launch_durability_and_tokens.sql` | Launch durability + outbound job tokens |
| `20260717131000_n8n_job_token_rpcs.sql` | n8n job token RPCs |

```bash
# Local CLI example (adjust for your project ref)
supabase db push
# Or apply each file via Supabase Dashboard → SQL → run migration contents
```

Verify RLS: authenticated users can read their team rows; `workflow_logs` restored and readable via `/api/workflow-logs`.

---

## 3. App host environment variables

Set on the Next.js host (Vercel / self-hosted). See `.env.example` for the full list. Minimum for launch:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public |
| `NEXT_PUBLIC_SITE_URL` | Production origin |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** |
| `ENCRYPTION_KEY` | 32+ chars; Gmail/Meta token encryption |
| `N8N_BOOTSTRAP_TOKEN` | Scheduler/claim endpoints |
| `N8N_INGEST_TOKEN` | Legacy fallback (rotate off after n8n hardening) |
| `N8N_WEBHOOK_TOKEN` | App → n8n webhook Header Auth |
| `N8N_WEBHOOK_BASE_URL` | n8n Cloud base URL |
| `OPENAI_API_KEY` | **App host only** — never in n8n |
| `CHANNEL_SENDER_TRANSPORT` | `sandbox` until Gmail/Meta live |
| `META_SEND_ENABLED` | `false` until App Review |
| `NEXT_PUBLIC_FEATURE_META_INBOX` | `false` until Meta live |
| `NEXT_PUBLIC_FEATURE_SOCIAL_PUBLISHING` | `false` until social live |
| `NEXT_PUBLIC_FEATURE_BILLING` | `false` until billing wired |

Redeploy the app after setting env vars.

---

## 4. n8n variables and credential cleanup

In n8n Cloud (Settings → Variables):

| Variable | Value |
|---|---|
| `NEXUS_APP_URL` | Production app origin (no trailing slash) |
| `N8N_BOOTSTRAP_TOKEN` | Same as app `N8N_BOOTSTRAP_TOKEN` |
| `N8N_INGEST_TOKEN` | Legacy; match app until rotated off |
| `N8N_SOCIAL_PUBLISH_WEBHOOK_URL` | WF8b webhook URL (when social enabled) |

**Webhook triggers** (WF0a, WF2, WF3, WF8b): configure **Header Auth** matching app `N8N_WEBHOOK_TOKEN`.

**Remove from n8n:**

- Supabase **service-role** credential from scheduler workflows (`WF0d`, `WF0e`, WF2 `Create Lead`, etc.)
- **OPENAI_API_KEY** — classification/draft/chat run on the app host only

**Re-import** hardened exports from `n8n_logic/exports/`:

- `wf0d_ledger_drain.json` → app `/api/internal/n8n/inbound-replay`
- `wf0e_gmail_backfill.json` → app `/api/internal/n8n/gmail-backfill`
- `wf2_classification.json` → app `/api/internal/n8n/leads` for Create Lead

Activate workflows after import. Keep `wf_error_alerts.json` **inactive** until a workflow-logs write endpoint ships.

---

## 5. OpenAI activation

1. Set `OPENAI_API_KEY` on the **app host only**.
2. Redeploy.
3. Run smoke test (locally or via GitHub Actions `post-credential-smoke` workflow, suite `openai`):

```bash
OPENAI_API_KEY=sk-... npm run test:openai-smoke
```

4. Verify Chat page shows AI available (not “AI provider is not configured”).

---

## 6. Google Gmail (live send)

1. In Google Cloud Console: approve **`gmail.send`** scope for the OAuth client.
2. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` on app host.
3. Founders **reconnect** mailboxes from `/profile` (reconsent for send scope).
4. Set `CHANNEL_SENDER_TRANSPORT=live` on app host (or empty per env convention).
5. Activate `WF0f` (sync), `WF0e` (backfill), approval sender workflow.
6. E2E checklist:
   - [ ] Inbound email appears in inbox
   - [ ] Classification runs (WF2)
   - [ ] Approve draft → outbound job queued → message sent
   - [ ] `workflow_logs` shows success rows at `/logs`

---

## 7. Meta (after App Review)

1. Set Meta app credentials on app host (`META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`).
2. Enable feature flags:
   - `NEXT_PUBLIC_FEATURE_META_INBOX=true`
   - `NEXT_PUBLIC_FEATURE_SOCIAL_PUBLISHING=true` (if publishing)
   - `META_SEND_ENABLED=true`
3. Bind Meta publishing credentials on WF8b in n8n.
4. Activate Meta intake + WF8b/WF8d as needed.
5. E2E checklist:
   - [ ] Webhook verification succeeds
   - [ ] Inbound WhatsApp/IG/FB message in inbox
   - [ ] Reply approval → send (sandbox first, then live)
   - [ ] Social publish (if enabled) completes without stuck `publishing` status

---

## Rollback

- Set `CHANNEL_SENDER_TRANSPORT=sandbox` and `META_SEND_ENABLED=false` to stop live sends immediately.
- Deactivate n8n scheduler workflows (`WF0d`, `WF0e`, `WF0f`) if intake must pause.
- App remains readable; approval queue stays intact.
