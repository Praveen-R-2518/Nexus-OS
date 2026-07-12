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

### Channel Sender — Approval Trigger workflow (`n8n_logic/exports/approval_trigger.json`)

The approval-trigger workflow calls the send executor `POST /api/internal/n8n/send-reply`
(see `docs/channel_sender.md`). It needs two n8n env vars:

| Env var | Purpose |
|---|---|
| `NEXUS_APP_BASE_URL` | Base URL of the Next.js app (e.g. `https://app.example.com`) — the HTTP node targets `${NEXUS_APP_BASE_URL}/api/internal/n8n/send-reply`. No trailing slash. |
| `N8N_INGEST_TOKEN` | Bearer token for all `/api/internal/n8n/*` routes (server-only; must match the app's env). |

**Do not activate** this workflow until the send-reply tests pass and Gmail `gmail.send`
scope is provisioned (until then the transport returns 403 — read-only OAuth).
