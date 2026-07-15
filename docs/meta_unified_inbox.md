# Meta Unified Inbox

WhatsApp Business, Instagram DMs, and Facebook Messenger ingest through the same pipeline as Gmail: tenant routing → `noise_filter.js` → WF2 classification → WF3 reply drafting → `/approval`.

## Architecture

1. **Meta** POSTs webhook events to `GET/POST /api/meta/webhook` (Next.js).
2. Next.js verifies `hub.verify_token` (GET) and `X-Hub-Signature-256` (POST, HMAC-SHA256 of raw body).
3. Duplicate message ids are dropped **durably**: every event is upserted into the `inbound_events` ledger with a unique `(platform, external_message_id)` index before it is acked (`lib/inbound-events.ts`) — a non-insert marks the event `duplicate`, and a failed persist refuses the ack so Meta redelivers.
4. **Tenant routing happens at the edge**, not in n8n: `lib/meta-tenant.ts` resolves the platform routing key (WA `phone_number_id`, IG account id, FB page id) against `business_profiles` and fails closed on no-match or ambiguous match. Unresolved events are stored `failed=tenant_unresolved` and never forwarded.
5. The verified payload — with the pre-resolved `_tenant` attached — is forwarded to `{N8N_WEBHOOK_BASE_URL}/webhook/gmail-inbound`. (`n8n_logic/tenant_route_resolver.js` remains only for the Gmail/IMAP path.)
6. **Multi-Channel Normalizer** emits `source` = `whatsapp` | `instagram` | `facebook` plus `external_thread_id` / `external_permalink`.
7. Conversations land in Supabase with platform indicators in `/inbox` and optional **Open in native inbox** deep links.

## Environment variables

```bash
META_APP_ID=
META_APP_SECRET=
META_WEBHOOK_VERIFY_TOKEN=
N8N_WEBHOOK_BASE_URL=https://your-instance.app.n8n.cloud
ENCRYPTION_KEY=          # required for OAuth token storage
NEXT_PUBLIC_SITE_URL=    # OAuth redirect + webhook public URL
```

## Meta Developer Console

1. Create a Meta app (Business type).
2. Add products: **WhatsApp**, **Instagram**, **Messenger**.
3. **Facebook Login** → Valid OAuth Redirect URI: `{SITE_URL}/api/meta/callback`
4. **Webhooks** → Callback URL: `{SITE_URL}/api/meta/webhook`, Verify Token: `META_WEBHOOK_VERIFY_TOKEN`
5. Subscribe Page, Instagram, and WhatsApp `messages` (and related) fields.
6. Link a Facebook Page, Instagram professional account, and WhatsApp Business Account.
7. Add test users (≤25) until App Review approves messaging permissions.

## Connect accounts (OAuth)

While logged in as workspace owner:

```
GET /api/meta/connect
GET /api/meta/connect?platform=whatsapp
GET /api/meta/status
```

Callback encrypts page access tokens in `meta_credentials` and updates routing keys on `business_profiles`.

## Verification

```bash
# Parser + tenant routing unit tests
npm run test:tenant-intake

# Regenerate n8n WF0a export after n8n_logic changes
npm run n8n:export-workflows
```

### Webhook handshake (local)

```bash
curl "{SITE_URL}/api/meta/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=12345"
# Expect: 12345
```

### Sample Instagram payload (n8n / normalizer tests)

```json
{
  "object": "instagram",
  "entry": [{
    "id": "17841400001",
    "messaging": [{
      "sender": { "id": "12345", "name": "Jane" },
      "recipient": { "id": "17841400001" },
      "timestamp": 1710000000,
      "message": { "mid": "mid.ig.1", "text": "Hi from IG" }
    }]
  }]
}
```

## Database (migration `20260619120000_meta_unified_inbox_foundation.sql`)

- `conversations.source` adds `whatsapp`, `instagram`, `facebook`
- `conversations.external_thread_id`, `external_permalink`
- `business_profiles.ig_account_id`, `fb_page_id`, `wa_phone_number_id`
- `meta_credentials` (encrypted tokens, RLS team-scoped)

## Inbox UI

- Platform icons: WhatsApp (green), Instagram (pink), Facebook (blue)
- **Open in {platform}** confirms before `window.open` to `wa.me`, `instagram.com/direct/t/…`, or `facebook.com/messages/t/…`

## workflow_logs

Intake drops and successes continue to log `normalized.source` and `normalized.channel` inside the `payload` jsonb — no schema change required. New Meta sources appear as `whatsapp`, `instagram`, or `facebook` in log payloads.
