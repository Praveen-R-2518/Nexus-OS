import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  n8nWebhookAuthHeaders,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import { queueOutboundJob, type OutboundJobRow } from "@/lib/outbound-jobs";
import type { ReplyDraft } from "@/types";

export const dynamic = "force-dynamic";

type ApprovalBody = {
  draft_id?: string;
  action?: "approve" | "reject";
  rejection_reason?: string;
  draft_text?: string;
};

function approvalWebhookUrl(): string | null {
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim();
  if (!base) {
    return null;
  }
  const normalized = base.replace(/\/+$/, "");
  return `${normalized}/webhook/approval-trigger`;
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "api:approval:patch", 30, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as ApprovalBody;

  if (!body.draft_id || typeof body.draft_id !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid draft_id" },
      { status: 400 },
    );
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return NextResponse.json(
      { error: 'action must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  if (
    body.action === "reject" &&
    (!body.rejection_reason || body.rejection_reason.trim() === "")
  ) {
    return NextResponse.json(
      { error: "rejection_reason is required when rejecting" },
      { status: 400 },
    );
  }

  const draftId = body.draft_id.trim();
  const nowIso = new Date().toISOString();
  const draftText =
    typeof body.draft_text === "string" && body.draft_text.trim() !== ""
      ? body.draft_text
      : undefined;

  const {
    data: existing,
    error: fetchError,
  } = await supabase
    .from("reply_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json(
      { error: fetchError.message },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const conversationId = String(
    (existing as ReplyDraft).conversation_id ?? "",
  ).trim();
  if (!conversationId) {
    return NextResponse.json(
      { error: "Draft has no conversation_id" },
      { status: 500 },
    );
  }

  const { data: convRow, error: convFetchErr } = await supabase
    .from("conversations")
    .select("workspace_id, source")
    .eq("id", conversationId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (convFetchErr) {
    return NextResponse.json(
      { error: convFetchErr.message },
      { status: 500 },
    );
  }

  const workspaceId =
    convRow &&
    typeof (convRow as { workspace_id?: string }).workspace_id === "string"
      ? (convRow as { workspace_id: string }).workspace_id.trim()
      : "";

  if (!workspaceId) {
    return NextResponse.json(
      {
        error:
          "Conversation is not linked to a workspace; complete workspace setup or re-sync ingest.",
      },
      { status: 409 },
    );
  }

  if (body.action === "approve") {
    const { data: updatedDraft, error: draftErr } = await supabase
      .from("reply_drafts")
      .update({
        approval_status: "approved",
        approved_at: nowIso,
        rejected_at: null,
        rejection_reason: null,
        ...(draftText ? { draft_text: draftText } : {}),
      })
      .eq("id", draftId)
      .eq("team_id", teamId)
      .select()
      .single();

    if (draftErr) {
      return NextResponse.json({ error: draftErr.message }, { status: 500 });
    }

    const { error: convErr } = await supabase
      .from("conversations")
      .update({ status: "approved", updated_at: nowIso })
      .eq("id", conversationId)
      .eq("team_id", teamId);

    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 500 });
    }

    // Durable outbound (Task B.1): a queued `outbound_jobs` row is the source of truth for
    // "this reply needs to be sent" — it survives an n8n webhook failure below, a crashed worker,
    // or n8n being unreachable, and can be drained/retried later. Writes go through a
    // service-role client because RLS revokes insert/update on this table from `authenticated`.
    let outboundJob: OutboundJobRow | null = null;
    try {
      const serviceClient = createServerClient();
      outboundJob = await queueOutboundJob(serviceClient, {
        draftId,
        teamId,
        workspaceId,
        conversationId,
        channel: (convRow as { source?: string } | null)?.source ?? null,
      });
    } catch (e) {
      console.error(
        "[approval] failed to queue outbound job:",
        e instanceof Error ? e.message : String(e),
      );
    }

    const webhook = approvalWebhookUrl();
    if (!webhook) {
      console.error(
        "[approval] N8N_WEBHOOK_BASE_URL not set; skipping n8n approval-trigger POST",
      );
    } else {
      try {
        const res = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...n8nWebhookAuthHeaders() },
          body: JSON.stringify({
            draft_id: draftId,
            action: "approve",
            conversation_id: conversationId,
            team_id: teamId,
            workspace_id: workspaceId,
          }),
        });
        if (!res.ok) {
          console.error(
            "[approval] n8n webhook non-OK:",
            res.status,
            await res.text().catch(() => ""),
          );
        }
      } catch (e) {
        console.error(
          "[approval] n8n webhook failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    return NextResponse.json({
      success: true,
      status: outboundJob?.status ?? "queued",
      draft: updatedDraft as ReplyDraft,
      outbound_job: outboundJob,
    });
  }

  const reason = body.rejection_reason!.trim();

  const { data: updatedDraft, error: draftErr } = await supabase
    .from("reply_drafts")
    .update({
      approval_status: "rejected",
      rejected_at: nowIso,
      rejection_reason: reason,
      approved_at: null,
    })
    .eq("id", draftId)
    .eq("team_id", teamId)
    .select()
    .single();

  if (draftErr) {
    return NextResponse.json({ error: draftErr.message }, { status: 500 });
  }

  const { error: convErr } = await supabase
    .from("conversations")
    .update({ status: "rejected", updated_at: nowIso })
    .eq("id", conversationId)
    .eq("team_id", teamId);

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    draft: updatedDraft as ReplyDraft,
  });
}
