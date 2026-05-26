import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiUser,
} from "@/lib/api-security";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
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

async function insertApprovalWorkflowLog(
  supabase: SupabaseClient,
  meta: {
    workspace_id: string;
    draft_id: string;
    conversation_id: string;
    action: "approve" | "reject";
  },
) {
  const { error } = await supabase.from("workflow_logs").insert({
    workspace_id: meta.workspace_id,
    workflow_name: "approval-trigger",
    step: "human_approval",
    result: "success",
    payload: {
      draft_id: meta.draft_id,
      conversation_id: meta.conversation_id,
      action: meta.action,
    },
  });
  if (error) {
    console.error("[approval] workflow_logs insert failed:", error.message);
  }
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "api:approval:patch", 30, 60_000);
  if (limited) return limited;

  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

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

  let supabase: SupabaseClient;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
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
    .select("workspace_id")
    .eq("id", conversationId)
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
      .select()
      .single();

    if (draftErr) {
      return NextResponse.json({ error: draftErr.message }, { status: 500 });
    }

    const { error: convErr } = await supabase
      .from("conversations")
      .update({ status: "approved", updated_at: nowIso })
      .eq("id", conversationId);

    if (convErr) {
      return NextResponse.json({ error: convErr.message }, { status: 500 });
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            draft_id: draftId,
            action: "approve",
            conversation_id: conversationId,
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

    await insertApprovalWorkflowLog(supabase, {
      workspace_id: workspaceId,
      draft_id: draftId,
      conversation_id: conversationId,
      action: "approve",
    });

    return NextResponse.json({
      success: true,
      draft: updatedDraft as ReplyDraft,
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
    .select()
    .single();

  if (draftErr) {
    return NextResponse.json({ error: draftErr.message }, { status: 500 });
  }

  const { error: convErr } = await supabase
    .from("conversations")
    .update({ status: "rejected", updated_at: nowIso })
    .eq("id", conversationId);

  if (convErr) {
    return NextResponse.json({ error: convErr.message }, { status: 500 });
  }

  await insertApprovalWorkflowLog(supabase, {
    workspace_id: workspaceId,
    draft_id: draftId,
    conversation_id: conversationId,
    action: "reject",
  });

  return NextResponse.json({
    success: true,
    draft: updatedDraft as ReplyDraft,
  });
}
