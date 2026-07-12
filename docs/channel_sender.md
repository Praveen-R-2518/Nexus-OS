# Channel Sender — Approval-to-Send Contract

> Member 1 · Task 1.1 (design). Status: **contract frozen; executor = task 1.2, n8n = task 1.3.**
> This is the doc every other Member-1 step is built against. If code and this doc disagree,
> fix one of them in the same PR — do not let them drift.

## Why this exists

After a founder clicks **Approve** in `/approval`, `app/api/approval/route.ts` PATCHes the
draft to `approval_status='approved'` and POSTs `{draft_id, action, conversation_id}` to
`{N8N_WEBHOOK_BASE_URL}/webhook/approval-trigger`. **No workflow listens on that path, so
nothing is ever sent.** The Channel Sender closes that gap: it turns an approved
`reply_draft` into a real email to the customer, tenant-scoped and idempotent.

Architecture principle #3 (CLAUDE.md): *all outbound is approval-gated.* The sender is the
**only** component that performs an actual send, and it only sends drafts that are already
`approved` (or auto-approved by the policy in `lib/approval-policy.ts`, task 1.4). Classifiers
and drafters never call it directly.

## Components

| Piece | Location | Task |
|---|---|---|
| Approval policy (auto-send vs. gate) | `lib/approval-policy.ts` | 1.4 |
| Send core (`executeSendReply` + `autopilotSend`) | `lib/channel-sender.ts` | 1.2 / 1.5 |
| Send executor (typed HTTP endpoint) | `app/api/internal/n8n/send-reply/route.ts` | 1.2 |
| Autopilot executor (policy-gated) | `app/api/internal/n8n/autopilot-send/route.ts` | 1.5 |
| Gmail transport (injectable) | `lib/gmail/send.ts` | 1.2 |
| Shared credential decrypt/refresh | `lib/gmail/credentials.ts` | 1.2 |
| n8n `approval-trigger` workflow | `n8n_logic/exports/approval_trigger.json` | 1.3 |

Trust boundary: **n8n never decrypts a token and never talks to Gmail.** It only calls the
token-guarded Next.js executor, which owns all secrets. This keeps `ENCRYPTION_KEY` and
Gmail tokens server-side (CLAUDE.md secrets rule).

## Flow

```
/approval (founder clicks Approve)
  └─ PATCH /api/approval  → reply_drafts.approval_status='approved', approved_at
                          → conversations.status='approved'
                          → POST {N8N_WEBHOOK_BASE_URL}/webhook/approval-trigger
                               { draft_id, action:'approve', conversation_id, team_id }
        └─ n8n approval-trigger workflow (thin)
             └─ POST /api/internal/n8n/send-reply   (Authorization: Bearer N8N_INGEST_TOKEN)
                  { draft_id, conversation_id, team_id, workspace_id? }
                   ├─ idempotency guard (already sent? → no-op)
                   ├─ load draft + conversation (recipient) + gmail credential
                   ├─ decrypt + refresh access token (server-side)
                   ├─ transport.sendEmail(...)   ← Gmail default, mock in tests
                   └─ reply_drafts.approval_status='sent', sent_at
                      conversations.status='replied'
```

WF3 autopilot (task 1.5) calls the **autopilot** entry point, gated by `lib/approval-policy.ts`,
instead of its old "Mark Auto-Sent" PATCH-only stub.

## Autopilot entry point (task 1.5)

`POST /api/internal/n8n/autopilot-send` — guarded by `requireN8nToken` + `rateLimit`. Called by
WF3 immediately after it saves a fresh (`pending`) draft.

```jsonc
{
  "draft_id": "uuid",  // required — the just-created reply_draft
  "team_id":  "uuid",  // required — tenant scope
  "lead_id":  "uuid"   // optional — policy inputs (falls back to the draft's lead_id)
}
```

Flow (in `autopilotSend`, `lib/channel-sender.ts`): load draft → gather policy inputs
(`leads.estimated_value` / `risk_type` / `risk_score`, `business_profiles.approval_mode` by
`team_id`, `reply_drafts.confidence`) → run the SINGLE `decideAutoSend()`:
- **gated** → leave the draft `pending` for the founder approval queue; return
  `200 {success:true, autoSend:false, gated:true, reason}`.
- **auto** → set `approval_status='approved'`+`approved_at`, then delegate to `executeSendReply`;
  return its result plus `{autoSend:true, reason}`.

The policy is enforced ONLY here (server-side) — never reimplemented in an n8n Code node. On a
transport failure the draft is left `approved` (not `pending`) so a replay can complete the send.

## Executor request contract

`POST /api/internal/n8n/send-reply` — guarded by `requireN8nToken` + `rateLimit`
(mirrors `app/api/internal/n8n/conversations/route.ts`).

```jsonc
{
  "draft_id":        "uuid",   // required
  "team_id":         "uuid",   // required — tenant scope for every query
  "conversation_id": "uuid",   // optional — falls back to the draft's conversation_id
  "workspace_id":    "uuid"    // optional — falls back to the conversation's workspace_id
}
```

### Recipient resolution
`conversations.customer_email` (NOT NULL, defaults to `''`). Empty → `409` (cannot send;
no recipient). No other source is consulted for email.

### Credential selection
`gmail_credentials` where `workspace_id = <resolved>` AND `credential_type='oauth'` AND
`status='connected'` AND `sync_enabled=true`. Decrypt `access_token_encrypted` /
`refresh_token_encrypted` with `decryptSecret`; if `token_expiry` is within the 5-minute
buffer, refresh via Google and persist the new `access_token_encrypted` + `token_expiry`
(reuse the logic from `app/api/internal/n8n/gmail-credentials/route.ts`, extracted to
`lib/gmail/credentials.ts`). No connected credential → `409` with a clear message.

## Status transitions (the only writes the executor makes)

| Table | Before | After success |
|---|---|---|
| `reply_drafts` | `approval_status='approved'`, `sent_at=null` | `approval_status='sent'`, `sent_at=now()` |
| `conversations` | `status='approved'` | `status='replied'`, `updated_at=now()` |

`conversations.status` has no CHECK constraint (free-text + index), so `replied` is valid.
All writes are scoped by `team_id` (and `id`). On a transport failure, **no** status change
is written; the executor returns `502` so the caller/ledger can retry.

## Idempotency (hard requirement — approving twice must not send twice)

Before sending, re-load the draft scoped by `team_id`. If `approval_status === 'sent'` **or**
`sent_at` is non-null → return `200 { success: true, alreadySent: true }` **without** calling
the transport. This makes n8n retries, double-clicks, and ledger replays safe. There is no
DB unique constraint added for this (additive-migration cost not justified); the guard is the
contract, and the executor is the single writer of `sent`.

## Responses

| Code | When |
|---|---|
| `200 {success:true, alreadySent:true}` | draft already sent (idempotent no-op) |
| `200 {success:true, messageId}` | sent now |
| `400` | missing/invalid `draft_id` or `team_id` |
| `401` | bad/missing `N8N_INGEST_TOKEN` |
| `404` | draft not found for this tenant |
| `409` | no recipient email, or no connected Gmail credential for the workspace |
| `502` | transport/Gmail failure (no status written — safe to retry) |
| `503` | server not configured (`N8N_INGEST_TOKEN`/`ENCRYPTION_KEY` missing) |

## Transport abstraction & the read-only-scope limitation

`lib/gmail/send.ts` exports a `GmailTransport` interface with a single
`sendEmail({ accessToken, from, to, subject, body })` method. The default implementation
calls the Gmail API `users.messages.send` (base64url-encoded RFC-822 message). Tests inject
a mock transport, so 1.2/1.6 are fully verifiable **without** hitting Google.

### Sandbox transport (task 1.6)

Set `CHANNEL_SENDER_TRANSPORT=sandbox` to make `sendGmailMessage` build + validate the RFC-822
message but **skip the Gmail HTTP call**, returning `{ messageId: "sandbox-<ts>" }`. This lets the
full send path (status transitions + idempotency) be proven end-to-end while Gmail is read-only
(`scripts/send_e2e.integration.ts`). It is **off by default** and MUST NOT be enabled in real
production — leave the var unset there so real `gmail.send` is used.

⚠️ **Gmail OAuth is read-only today.** `app/api/gmail/helpers.ts` requests only
`gmail.readonly` + `userinfo.email`. `users.messages.send` needs `https://www.googleapis.com/auth/gmail.send`.
Until the human re-provisions the send scope on the production domain (Gmail is domain-blocked
in beta), the default transport will get a `403` from Google — **expected**. The executor,
policy, idempotency, and status logic are all complete and tested now; real sending flips on
automatically once the scope is granted and connected accounts re-consent. No code change
needed at that point.

## Subject line

`reply_drafts` has no subject column. The executor derives the subject as
`Re: <conversation subject>` when the conversation's `raw_payload` carries an email subject,
else a business-safe default (`"Re: your message"`). Threading headers
(`In-Reply-To`/`References`) are out of scope for 1.2 and noted as a follow-up.

## Follow-ups (not in 1.2)
- RFC-822 threading headers for proper Gmail threading.
- Meta (WhatsApp/Messenger) transport — see task 1.7 / `docs/meta_outbound.md`.
- Per-send audit row / AI-cost row — coordinate with Member 4's `ai_usage` (task 4.4).
