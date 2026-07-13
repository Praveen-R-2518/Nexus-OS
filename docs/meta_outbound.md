# Meta outbound groundwork (WhatsApp / Messenger / Instagram)

> **Status: GROUNDWORK ONLY (checklist 1.7). Live Meta sending is DISABLED.**
> `lib/meta/send.ts#sendMetaMessage` throws `501` on purpose. This document + the pure window
> policy (`lib/meta/window.ts`) + the request builders exist so the real sender can be wired later
> without re-deciding the compliance rules. Do **not** enable live sending as part of 1.7.

Companion to [`docs/channel_sender.md`](./channel_sender.md) (Gmail send path, already live) and
[`docs/meta_unified_inbox.md`](./meta_unified_inbox.md) (inbound). Meta **inbound** is handled:
`app/api/meta/webhook/route.ts` verifies `X-Hub-Signature-256`, `parse.ts#extractMessages` pulls
message ids, and the normalizer produces canonical conversations. This doc covers the missing
**outbound** direction and how it plugs into the same approval-gated pipeline.

## 1. The core constraint — you cannot message freely

Unlike email, Meta forbids arbitrary outbound messages. What you may send depends on **how long
ago the customer last messaged you** (the *customer service window*) and the **channel**:

| Channel | Inside 24h of customer's last message | Outside 24h |
|---|---|---|
| **WhatsApp** (Cloud API) | Free-form "session" text/media | **Approved message template (HSM)** only — can be sent anytime, re-opens the conversation |
| **Messenger** (Facebook) | Free-form text/media | Only with a **message tag**; we support `HUMAN_AGENT` (needs the Human Agent permission → extends to **7 days**). No templates. |
| **Instagram** | Free-form text/media | Same as Messenger: `HUMAN_AGENT` tag ≤7d, else blocked. No templates. |

This logic is implemented once, deterministically, in **`lib/meta/window.ts`**:

- `withinServiceWindow(lastInboundAt, now)` — true only if we can prove the customer messaged in
  the last 24h. Unknown/invalid timestamp ⇒ **outside** (fail closed).
- `chooseSendStrategy({ platform, lastInboundAt, now, humanAgentEnabled })` → one of:
  - `session_text` — free-form allowed (inside 24h, any channel)
  - `template` — WhatsApp outside 24h → must use an approved template
  - `human_agent_tag` — Messenger/IG, 24h–7d, only if `humanAgentEnabled`
  - `blocked` — nothing may be sent now (with a `reason`)

`lib/meta/window.ts` is the single source of truth; the approval UI, the sender, and any future
re-engagement scheduler must all consult it so they agree on what is sendable.

## 2. Where outbound plugs into the existing pipeline

Reuse the approval-gated core, do **not** build a parallel path. Today
`lib/channel-sender.ts#executeSendReply` is Gmail-only (resolves `conversations.customer_email`
and calls `sendGmailMessage`). The Meta wiring adds a **channel dispatch** in front of the
transport, keeping everything else (idempotency guard, `approval_status: approved → sent`,
`conversations.status → replied`, tenant scoping, approval-policy gating) identical:

```
executeSendReply
  ├─ load draft (approved?) + conversation  ← unchanged
  ├─ dispatch on conversation.source / channel:
  │    ├─ "gmail"                    → sendGmailMessage(...)                  (LIVE today)
  │    └─ "whatsapp"|"facebook"|"instagram"
  │         → strategy = chooseSendStrategy(...)          (lib/meta/window.ts)
  │         → if strategy.kind === "blocked": return 409 (surface to founder; no send)
  │         → req = buildMetaSendRequest(...)             (lib/meta/send.ts)
  │         → sendMetaMessage(...)   ← DISABLED (throws 501) until the enable task
  └─ on success: same status transitions as Gmail
```

The approval policy (`lib/approval-policy.ts`) is unchanged and channel-agnostic: high value /
churn-risk still hard-gate to the founder queue regardless of channel.

### Recipient & sender identity

- **Recipient** comes from the conversation, not `customer_email`. The normalizer stores the
  customer's Meta identity in `customer_email_or_phone` (WhatsApp E.164 number; Messenger PSID;
  Instagram IGSID) with `external_thread_id` / `external_permalink` (e.g. `wa.me/<digits>`). The
  live wiring will read that column (a `customer_ref` / `channel` accessor is the clean addition).
- **Sender** is the business asset id: WhatsApp `phone_number_id`, or the Facebook/Instagram page
  id — available on the `meta_credentials` row (see §3).

## 3. Credentials — decrypt server-side, never in n8n

Meta tokens live in **`meta_credentials`** (written by `app/api/meta/callback/route.ts`), keyed by
`(workspace_id, user_id, platform)`, with `access_token_encrypted` (AES-256-GCM via
`lib/encryption/credential-secret.ts#encryptSecret`). The live sender will add
`getWorkspaceMetaCredential(supabase, workspaceId, platform)` mirroring
`lib/gmail/credentials.ts` — decrypt happens **server-side in the Next.js executor**, exactly like
Gmail. n8n never sees a token; it only calls the internal executor with the ingest bearer. Graph
calls use `https://graph.facebook.com/v21.0` (keep `GRAPH_VERSION` in `lib/meta/send.ts` in sync
with `META_GRAPH_VERSION` in `app/api/meta/helpers.ts`).

## 4. Graph API request shapes (already built, not yet sent)

`lib/meta/send.ts#buildMetaSendRequest` returns the `{ url, body }` we will POST, per strategy:

- **WhatsApp session** → `POST /{phone_number_id}/messages`
  `{ messaging_product:"whatsapp", to, type:"text", text:{ body } }`
- **WhatsApp template** → same URL, `type:"template"`,
  `template:{ name, language:{ code }, components? }`
- **Messenger/Instagram session** → `POST /{page_id}/messages`
  `{ recipient:{ id }, messaging_type:"RESPONSE", message:{ text } }`
- **Messenger/Instagram Human Agent** → same URL,
  `{ recipient:{ id }, messaging_type:"MESSAGE_TAG", tag:"HUMAN_AGENT", message:{ text } }`

These are unit-tested in `scripts/meta_window.test.ts` (`npm run test:meta-window`).

## 5. Delivery & read receipts (currently ignored — by design)

`parse.ts#extractMessages` deliberately returns nothing for status/read events (WhatsApp
`statuses[]`, Messenger `delivery`/`read`), matching `NEXUS_REBUILD_CONTEXT §5`. Groundwork for
when we want them:

- WhatsApp returns a `wamid` when a message is accepted; Messenger returns a `message_id`. Persist
  that on the sent `reply_drafts` row (e.g. a `provider_message_id` column — additive migration) so
  a later status webhook (`sent → delivered → read`, or `failed`) can be matched back.
- A `failed` status (e.g. template not approved, outside window) should mark the draft for founder
  attention rather than silently dropping — surfaced in the approval/inbox UI.
- No receipt handling ships in 1.7; this section is the contract for the follow-up task.

## 6. What must be true before enabling live sending (explicit follow-up task)

1. Meta app has the messaging permissions live (`whatsapp_business_messaging`, `pages_messaging`,
   `instagram_business_manage_messages`, and Human Agent if used) — see `META_SCOPES`.
2. `getWorkspaceMetaCredential(...)` implemented + tested (decrypt/refresh, per platform).
3. Channel dispatch added to `executeSendReply`; `sendMetaMessage` implemented (replace the `501`
   throw with a real Graph POST) with an env kill-switch, mirroring `CHANNEL_SENDER_TRANSPORT`.
4. At least one approved WhatsApp **template** exists for the out-of-window case.
5. `provider_message_id` migration + delivery-status webhook handling (§5).
6. End-to-end proof against a sandbox/test number, including the `blocked` and `template` branches.

Until all of the above land, `sendMetaMessage` stays disabled and this remains documentation.
