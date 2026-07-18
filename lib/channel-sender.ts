/**
 * Channel Sender core (docs/channel_sender.md).
 *
 * Framework-agnostic send logic shared by two internal entry points:
 *   - `/api/internal/n8n/send-reply`   → human-approved drafts (executeSendReply)
 *   - `/api/internal/n8n/autopilot-send` → WF3 autopilot, policy-gated (autopilotSend)
 *
 * Both return `{ status, body }` (no NextResponse here) so the routes stay thin and this stays
 * unit-testable. The auto-send policy lives ONLY in `lib/approval-policy.ts` — enforced here,
 * never duplicated in n8n.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getWorkspaceGmailCredential } from "@/lib/gmail/credentials";
import { GmailSendError, sendGmailMessage } from "@/lib/gmail/send";
import { getWorkspaceMailboxCredential } from "@/lib/mailbox/credentials";
import { SmtpSendError, sendSmtpMessage } from "@/lib/mailbox/smtp-send";
import { getWorkspaceMetaCredential } from "@/lib/meta/credentials";
import { MetaSendError, sendMetaMessage } from "@/lib/meta/send";
import { chooseSendStrategy, type MetaPlatform } from "@/lib/meta/window";
import { decideAutoSend } from "@/lib/approval-policy";
import { markOutboundJobResult, queueOutboundJob } from "@/lib/outbound-jobs";

export interface SenderResult {
  status: number;
  body: Record<string, unknown>;
}

type DraftRow = {
  id: string;
  team_id: string | null;
  workspace_id: string | null;
  conversation_id: string | null;
  lead_id: string | null;
  draft_text: string;
  approval_status: string | null;
  confidence: number | null;
  sent_at: string | null;
};

type ConversationRow = {
  customer_email: string | null;
  customer_phone: string | null;
  source: string | null;
  workspace_id: string | null;
  raw_payload: unknown;
  received_at: string | null;
};

const META_PLATFORMS: readonly MetaPlatform[] = ["whatsapp", "instagram", "facebook"];

/** Meta conversations dispatch to the Graph sender; everything else stays on Gmail. */
function metaPlatformOf(conversation: ConversationRow): MetaPlatform | null {
  const source = (conversation.source ?? "").trim().toLowerCase();
  return (META_PLATFORMS as readonly string[]).includes(source)
    ? (source as MetaPlatform)
    : null;
}

type LeadRow = {
  estimated_value: number | null;
  risk_type: string | null;
  risk_score: number | null;
};

type BusinessProfileRow = {
  approval_mode: string | null;
  high_value_threshold: number | null;
  high_risk_score: number | null;
};

function err(error: string, status: number): SenderResult {
  return { status, body: { success: false, error } };
}

/**
 * Advance the `outbound_jobs` row for `draftId` to a terminal status based on the dispatch
 * outcome, then pass the result through unchanged. Best-effort — `markOutboundJobResult` never
 * throws, so this can never turn a real send success/failure into a different HTTP response.
 */
async function finalizeOutboundJob(
  supabase: SupabaseClient,
  draftId: string,
  result: SenderResult,
): Promise<SenderResult> {
  if (result.status >= 200 && result.status < 300) {
    const messageId =
      typeof result.body.messageId === "string" ? result.body.messageId : null;
    await markOutboundJobResult(supabase, draftId, { status: "sent", providerMessageId: messageId });
  } else {
    const error =
      typeof result.body.error === "string"
        ? result.body.error
        : `send failed with status ${result.status}`;
    await markOutboundJobResult(supabase, draftId, { status: "failed", error });
  }
  return result;
}

/** Derive a reply subject from the inbound message payload; fall back to a safe default. */
function deriveSubject(rawPayload: unknown): string {
  const p =
    rawPayload && typeof rawPayload === "object"
      ? (rawPayload as Record<string, unknown>)
      : {};
  const headers =
    p.headers && typeof p.headers === "object"
      ? (p.headers as Record<string, unknown>)
      : {};
  const candidates = [p.subject, headers.Subject, headers.subject];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      const s = c.trim().slice(0, 400);
      return /^re:/i.test(s) ? s : `Re: ${s}`;
    }
  }
  return "Re: your message";
}

const DRAFT_SELECT =
  "id, team_id, workspace_id, conversation_id, lead_id, draft_text, approval_status, confidence, sent_at";

export interface SendReplyInput {
  draftId: string;
  teamId: string;
  conversationId?: string | null;
  workspaceId?: string | null;
}

/**
 * Send an APPROVED draft as an email and advance statuses. Tenant-scoped and idempotent:
 * a draft already `sent` is a no-op. Any transport failure returns 502 with NO state change so
 * the caller/ledger can retry. Accepts an already-loaded draft to avoid a redundant re-read
 * when called from the autopilot path.
 */
export async function executeSendReply(
  supabase: SupabaseClient,
  input: SendReplyInput,
  preloadedDraft?: DraftRow,
): Promise<SenderResult> {
  const { draftId, teamId } = input;

  let draft = preloadedDraft;
  if (!draft) {
    const { data, error } = await supabase
      .from("reply_drafts")
      .select(DRAFT_SELECT)
      .eq("id", draftId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (error) {
      console.error("[channel-sender] draft load error:", error);
      return err("Failed to load draft", 502);
    }
    if (!data) return err("Draft not found", 404);
    draft = data as DraftRow;
  }

  // Idempotency guard — never send twice.
  if (draft.approval_status === "sent" || draft.sent_at) {
    return { status: 200, body: { success: true, alreadySent: true } };
  }

  // Only approved drafts may be sent (approval-gated; principle #3).
  if (draft.approval_status !== "approved") {
    return err(
      `Draft is not approved (approval_status=${draft.approval_status ?? "null"})`,
      409,
    );
  }

  // Resolve the conversation + recipient.
  const conversationId =
    (input.conversationId ? String(input.conversationId) : null) ??
    (draft.conversation_id ? String(draft.conversation_id) : null);
  if (!conversationId) return err("Draft has no conversation_id", 409);

  const { data: convData, error: convErr } = await supabase
    .from("conversations")
    .select("customer_email, customer_phone, source, workspace_id, raw_payload, received_at")
    .eq("id", conversationId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (convErr) {
    console.error("[channel-sender] conversation load error:", convErr);
    return err("Failed to load conversation", 502);
  }
  if (!convData) return err("Conversation not found", 404);
  const conversation = convData as ConversationRow;

  // Resolve the workspace before dispatching to a channel transport.
  const workspaceId =
    (input.workspaceId ? String(input.workspaceId) : null) ??
    (conversation.workspace_id ? String(conversation.workspace_id) : null) ??
    (draft.workspace_id ? String(draft.workspace_id) : null);
  if (!workspaceId) return err("Could not resolve workspace_id for send", 409);

  // Durable outbound (Task B.1/B.2): ensure a `queued` outbound_jobs row exists before we attempt
  // dispatch. The human-approval path (`/api/approval`) already queues one on approve; autopilot
  // does not, so this upsert is what creates it for that path. From here on every return finalizes
  // the job to 'sent' or 'failed' via `finalize` so the row never stays stuck at 'queued' once a
  // send attempt has actually started.
  await queueOutboundJob(supabase, {
    draftId,
    teamId,
    workspaceId,
    conversationId,
    channel: conversation.source ?? null,
  });
  const finalize = (result: SenderResult) => finalizeOutboundJob(supabase, draftId, result);

  // Channel dispatch (docs/meta_outbound.md §2): Meta sources go to the Graph
  // sender (kill-switch gated), everything else keeps the live Gmail path.
  const metaPlatform = metaPlatformOf(conversation);
  let messageId = "";

  if (metaPlatform) {
    // Recipient is the customer's Meta identity: WhatsApp E.164 number, or
    // Messenger PSID / Instagram IGSID — the normalizer stores it on the
    // conversation (customer_phone for WA when present, else customer_email).
    const recipient =
      (metaPlatform === "whatsapp"
        ? (conversation.customer_phone ?? "").trim() ||
          (conversation.customer_email ?? "").trim()
        : (conversation.customer_email ?? "").trim());
    if (!recipient) return finalize(err("Conversation has no Meta recipient id to send to", 409));

    const credResult = await getWorkspaceMetaCredential(supabase, workspaceId, metaPlatform);
    if (!credResult.ok || !credResult.credential) {
      if (credResult.error === "encryption_not_configured") {
        return finalize(err("Server configuration error", 503));
      }
      if (credResult.error === "decrypt_failed") {
        return finalize(err("Meta credential could not be used to send", 502));
      }
      if (credResult.error === "token_expired") {
        return finalize(err("Meta connection expired — reconnect the account in Settings", 409));
      }
      return finalize(err(`No connected ${metaPlatform} account for this workspace`, 409));
    }

    // Compliance window (lib/meta/window.ts is the single source of truth).
    const strategy = chooseSendStrategy({
      platform: metaPlatform,
      lastInboundAt: conversation.received_at,
      humanAgentEnabled: process.env.META_HUMAN_AGENT_ENABLED?.trim() === "true",
    });
    if (strategy.kind === "blocked") {
      return finalize(err(`Cannot send on ${metaPlatform}: ${strategy.reason}`, 409));
    }

    // Out-of-window WhatsApp requires a pre-approved template (HSM).
    const templateName = process.env.META_WA_TEMPLATE_NAME?.trim();
    const templateLang = process.env.META_WA_TEMPLATE_LANG?.trim() || "en";
    if (strategy.kind === "template" && !templateName) {
      return finalize(
        err(
          "Outside the 24h WhatsApp window and no approved template is configured (META_WA_TEMPLATE_NAME)",
          409,
        ),
      );
    }

    try {
      const result = await sendMetaMessage(
        {
          platform: metaPlatform,
          senderId: credResult.credential.senderId,
          recipientId: recipient,
          text: draft.draft_text,
          strategy,
          ...(strategy.kind === "template" && templateName
            ? { template: { name: templateName, languageCode: templateLang } }
            : {}),
        },
        { accessToken: credResult.credential.accessToken },
      );
      messageId = result.messageId;
    } catch (e) {
      const status = e instanceof MetaSendError ? e.status : 502;
      console.error(
        `[channel-sender] meta transport error (upstream=${status}):`,
        e instanceof Error ? e.message : e,
      );
      // 501 = kill-switch off (META_SEND_ENABLED unset) — surface that clearly.
      if (status === 501) {
        return finalize(err("Meta outbound sending is not enabled yet", 501));
      }
      return finalize(err("Failed to send reply", 502));
    }
  } else {
    const recipient = (conversation.customer_email ?? "").trim();
    if (!recipient) return finalize(err("Conversation has no customer_email to send to", 409));

    // Resolve the workspace's Gmail OAuth credential FIRST (decrypt + refresh server-side). This keeps
    // the Gmail path — and every existing test — byte-for-byte unchanged: a workspace with a connected
    // Gmail account never reaches the SMTP fallback below.
    const credResult = await getWorkspaceGmailCredential(supabase, workspaceId);
    if (credResult.ok && credResult.credential) {
      const credential = credResult.credential;
      // Send via the injectable transport (no state change on failure).
      try {
        const result = await sendGmailMessage({
          accessToken: credential.accessToken,
          from: credential.emailAddress,
          to: recipient,
          subject: deriveSubject(conversation.raw_payload),
          body: draft.draft_text,
        });
        messageId = result.messageId;
      } catch (e) {
        const upstream = e instanceof GmailSendError ? e.status : "n/a";
        console.error(
          `[channel-sender] transport error (upstream=${upstream}):`,
          e instanceof Error ? e.message : e,
        );
        return finalize(err("Failed to send reply", 502));
      }
    } else if (credResult.error === "no_connected_credential") {
      // No Gmail OAuth mailbox for this workspace — fall through to a generic SMTP mailbox
      // (credential_type='imap' with an smtp_host) if one is connected. Same approval gate, same
      // durable outbound bookkeeping; only the transport differs. Encryption is already gated above
      // (the Gmail resolver returns encryption_not_configured first), so at runtime the only mailbox
      // failure that isn't "no usable mailbox" is a decrypt error.
      const mailbox = await getWorkspaceMailboxCredential(supabase, workspaceId);
      if (mailbox.ok && mailbox.credential?.smtp) {
        try {
          const result = await sendSmtpMessage({
            smtp: mailbox.credential.smtp,
            from: mailbox.credential.emailAddress,
            to: recipient,
            subject: deriveSubject(conversation.raw_payload),
            body: draft.draft_text,
          });
          messageId = result.messageId;
        } catch (e) {
          const upstream = e instanceof SmtpSendError ? e.status : "n/a";
          console.error(
            `[channel-sender] smtp transport error (upstream=${upstream}):`,
            e instanceof Error ? e.message : e,
          );
          return finalize(err("Failed to send reply", 502));
        }
      } else if (mailbox.error === "decrypt_failed") {
        return finalize(err("Mailbox credential could not be used to send", 502));
      } else {
        return finalize(err("No connected mailbox for this workspace", 409));
      }
    } else if (credResult.error === "encryption_not_configured") {
      return finalize(err("Server configuration error", 503));
    } else if (credResult.error === "refresh_failed" || credResult.error === "decrypt_failed") {
      return finalize(err("Gmail credential could not be used to send", 502));
    } else {
      return finalize(err("No connected Gmail account for this workspace", 409));
    }
  }

  // Mark sent (draft) + replied (conversation). Tenant-scoped writes.
  const nowIso = new Date().toISOString();
  const { error: draftUpdErr } = await supabase
    .from("reply_drafts")
    .update({
      approval_status: "sent",
      sent_at: nowIso,
      updated_at: nowIso,
      provider_message_id: messageId || null,
    })
    .eq("id", draftId)
    .eq("team_id", teamId);
  if (draftUpdErr) {
    console.error("[channel-sender] draft status update error:", draftUpdErr);
    // The email WAS sent; surface but do not pretend it failed.
    return finalize({
      status: 200,
      body: { success: true, messageId, warning: "sent_but_status_update_failed" },
    });
  }

  const { error: convUpdErr } = await supabase
    .from("conversations")
    .update({ status: "replied", updated_at: nowIso })
    .eq("id", conversationId)
    .eq("team_id", teamId);
  if (convUpdErr) {
    console.error("[channel-sender] conversation status update error:", convUpdErr);
  }

  return finalize({ status: 200, body: { success: true, alreadySent: false, messageId } });
}

export interface AutopilotInput {
  draftId: string;
  teamId: string;
  leadId?: string | null;
}

/**
 * WF3 autopilot entry point. Loads the freshly-created (pending) draft and its policy inputs,
 * runs the SINGLE policy (`decideAutoSend`), and either:
 *   - gated  → leaves the draft `pending` for the approval queue, returns `{ gated:true, reason }`
 *   - auto   → marks it `approved`, then delegates to `executeSendReply`.
 * On transport failure the draft is left `approved` (not `pending`) so a replay can send it.
 */
export async function autopilotSend(
  supabase: SupabaseClient,
  input: AutopilotInput,
): Promise<SenderResult> {
  const { draftId, teamId } = input;

  const { data: draftData, error: draftErr } = await supabase
    .from("reply_drafts")
    .select(DRAFT_SELECT)
    .eq("id", draftId)
    .eq("team_id", teamId)
    .maybeSingle();
  if (draftErr) {
    console.error("[channel-sender] autopilot draft load error:", draftErr);
    return err("Failed to load draft", 502);
  }
  if (!draftData) return err("Draft not found", 404);
  const draft = draftData as DraftRow;

  // Idempotent: already sent → no-op.
  if (draft.approval_status === "sent" || draft.sent_at) {
    return { status: 200, body: { success: true, alreadySent: true } };
  }

  // Gather policy inputs (authoritative, server-side).
  const leadId = input.leadId ?? draft.lead_id ?? null;
  let lead: LeadRow = { estimated_value: null, risk_type: null, risk_score: null };
  if (leadId) {
    const { data: leadData } = await supabase
      .from("leads")
      .select("estimated_value, risk_type, risk_score")
      .eq("id", leadId)
      .eq("team_id", teamId)
      .maybeSingle();
    if (leadData) lead = leadData as LeadRow;
  }

  const { data: bpData } = await supabase
    .from("business_profiles")
    .select("approval_mode, high_value_threshold, high_risk_score")
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle();
  const bp = bpData as BusinessProfileRow | null;
  const approvalMode = bp?.approval_mode ?? null;

  const decision = decideAutoSend({
    approvalMode,
    estimatedValue: lead.estimated_value,
    riskType: lead.risk_type,
    riskScore: lead.risk_score,
    confidence: draft.confidence,
    highValueThreshold: bp?.high_value_threshold,
    highRiskScore: bp?.high_risk_score,
  });

  if (!decision.autoSend) {
    // Leave the draft pending for the founder approval queue.
    return {
      status: 200,
      body: { success: true, autoSend: false, gated: true, reason: decision.reason },
    };
  }

  // Auto-approve, then send through the shared core (reusing the loaded draft).
  const nowIso = new Date().toISOString();
  const { error: approveErr } = await supabase
    .from("reply_drafts")
    .update({ approval_status: "approved", approved_at: nowIso, updated_at: nowIso })
    .eq("id", draftId)
    .eq("team_id", teamId);
  if (approveErr) {
    console.error("[channel-sender] autopilot approve error:", approveErr);
    return err("Failed to approve draft for autopilot send", 502);
  }

  const sent = await executeSendReply(supabase, { draftId, teamId }, {
    ...draft,
    approval_status: "approved",
  });
  // Annotate that this went through the autopilot path.
  return {
    status: sent.status,
    body: { ...sent.body, autoSend: true, reason: decision.reason },
  };
}
