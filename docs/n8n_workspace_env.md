# n8n environment variables

Operational rows (`conversations`, `workflow_logs`, `leads`, etc.) are **team-scoped** (`team_id` required). Intake workflows resolve the tenant from `public.business_profiles` routing columns (see migration `0012_business_profiles_integration_routing.sql`) before the Multi-Channel Normalizer runs.

## Tenant routing (WF0a export)

The [`n8n_logic/exports/wf0a_gmail_intake.json`](../n8n_logic/exports/wf0a_gmail_intake.json) graph runs **Tenant Route Extract** → **Supabase GET business_profiles** → **Verify Tenant Context** → **Multi-Channel Normalizer**.

| Name | Purpose |
|------|---------|
| `NEXUS_GMAIL_DESTINATION_MAILBOX` | Fallback destination mailbox (lowercase) when IMAP/webhook items lack `Delivered-To` / `To` headers — e.g. `nexus.demo@gmail.com`. Must match `business_profiles.gmail_destination_email`. |
| `NEXUS_WHATSAPP_DESTINATION_NUMBER` | Fallback WhatsApp routing number when the payload has no Meta `metadata` / `to` field. Must match `business_profiles.whatsapp_routing_number`. |
| `NEXUS_WHATSAPP_TOKEN_HEADER` | Optional. Header name for opaque webhook token (default `x-nexus-webhook-token`). Must match `business_profiles.webhook_route_token`. |
| `NEXUS_WHATSAPP_DEST_HEADER` | Optional. Custom header for inbound WhatsApp “to” routing (default `x-whatsapp-to`). |
| `NEXUS_WORKSPACE_ID` | Fallback UUID when the matched `business_profiles` row has no `workspace_id`. Conversation / workflow_log POST bodies use `workspace_id: normalized.workspace_id \|\| $env.NEXUS_WORKSPACE_ID`. |

Route resolution order: **webhook token header** → **WhatsApp routing number** (Meta-style body or headers) → **Gmail destination mailbox**.

## Supabase credential

HTTP nodes use your n8n **Supabase API** custom auth credential (service role or anon per your deployment). The export generator embeds a placeholder credential id — replace with your instance credential.

## Next.js internal ingest (`/api/internal/n8n/*`)

These routes require a JSON field `workspace_id` (UUID) and verify it exists in `public.workspaces` before inserting. They are an alternative to direct Supabase REST from n8n.

### Channel Sender — Approval Trigger + WF3 Autopilot (calls into the Next.js app)

The approval-trigger workflow (`n8n_logic/exports/approval_trigger.json`, live id
`PtfTN2YTN8bmHzDu`) and WF3's `Autopilot Send (policy-gated)` node call the Next.js executors
`POST /api/internal/n8n/send-reply` and `/autopilot-send` (see `docs/channel_sender.md`).

> ⚠️ **n8n Cloud blocks `$env` in node expressions** (`N8N_BLOCK_ENV_ACCESS_IN_NODE`, not
> changeable on Cloud). Using `{{ $env.X }}` in a node fails with *"access to env vars denied"*.
> Read config via **n8n Variables** (`{{ $vars.X }}`, Settings → Variables) or credentials instead.

Current wiring:
| Value | How it's supplied |
|---|---|
| App base URL | **Hardcoded** in the node (`https://nexusos.knurdz.org`) — not secret, avoids a variable. |
| `N8N_INGEST_TOKEN` | `{{ $vars.N8N_INGEST_TOKEN }}` — add as an n8n **Variable** (must match the app's env value). |

> **Naming note:** three different names have shown up for "the app's base URL" across this repo —
> `NEXT_PUBLIC_SITE_URL` (the real Next.js env var, used for OAuth redirect URIs and Supabase Auth
> redirects — this is the canonical one for anything running *inside* the app), the n8n Variable
> `NEXUS_APP_URL` (used by WF8b/WF8d, see below), and `NEXUS_APP_BASE_URL` (referenced by
> `n8n_logic/workflow_3_agent.js`'s retrieval call and older docs/scripts, kept only as a fallback
> name in that file). Don't introduce a fourth name — new n8n Variables that need the app's base
> URL should use `NEXUS_APP_URL`; new Next.js code should use `NEXT_PUBLIC_SITE_URL`.

**Do not activate** for real sends until Gmail `gmail.send` scope is provisioned (until then set
`CHANNEL_SENDER_TRANSPORT=sandbox` on the app to complete the path without real email).

### WF8b Social Post Publishing (calls into the Next.js app)

WF8b (`VZ9ZaA1S2JxSAeGQ`) fetches decrypted social platform tokens via
`GET /api/internal/n8n/social-credentials?organization_id={orgId}` — n8n must **never** read
`social_credentials` tokens directly from Supabase REST.

| Value | How it's supplied |
|---|---|
| App base URL | `{{ $vars.NEXUS_APP_URL }}` with fallback `https://nexusos.knurdz.org` |
| `N8N_INGEST_TOKEN` | `{{ $vars.N8N_INGEST_TOKEN }}` (or `NEXUS_INGEST_TOKEN`) — n8n **Variable** |

Requires app deploy of the social-credentials endpoint and migration `20260713180000`.
