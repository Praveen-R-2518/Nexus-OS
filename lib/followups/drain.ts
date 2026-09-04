import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { draftReply } from "@/lib/ai/draft";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

type LeadEmbed = {
  id?: string;
  team_id?: string | null;
  workspace_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  intent?: string | null;
  urgency?: string | null;
  estimated_value?: number | null;
  conversation_id?: string | null;
};

export type FollowupDrainResult = {
  claimed: number;
  processed: number;
  failed: number;
  skipped: boolean;
};

function asLead(raw: unknown): LeadEmbed | null {
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw)) return asLead(raw[0]);
  return raw as LeadEmbed;
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

/**
 * Claim due follow-ups and persist approval-gated reply drafts. n8n only orchestrates this
 * function — it must not write followups/reply_drafts via Supabase REST.
 */
export async function drainDueFollowups(
  supabase: SupabaseClient,
  opts?: { limit?: unknown },
): Promise<FollowupDrainResult> {
  const limit = clampLimit(opts?.limit);
  const nowIso = new Date().toISOString();

  const { data: due, error: dueErr } = await supabase
    .from("followups")
    .select(
      "id, team_id, workspace_id, status, scheduled_for, lead_id, conversation_id, leads(id, team_id, workspace_id, customer_name, customer_email, intent, urgency, estimated_value, conversation_id)",
    )
    .in("status", ["pending", "scheduled"])
    .lte("scheduled_for", nowIso)
    .not("team_id", "is", null)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (dueErr) {
    throw new Error(dueErr.message);
  }
  const rows = due ?? [];
  if (rows.length === 0) {
    return { claimed: 0, processed: 0, failed: 0, skipped: true };
  }

  const ids = rows.map((r) => r.id as string);
  const { error: claimErr } = await supabase
    .from("followups")
    .update({ status: "processing" })
    .in("id", ids)
    .in("status", ["pending", "scheduled"]);
  if (claimErr) {
    throw new Error(claimErr.message);
  }

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    const teamId = typeof row.team_id === "string" ? row.team_id : null;
    const followupId = row.id as string;
    if (!teamId) {
      failed += 1;
      await supabase.from("followups").update({ status: "pending" }).eq("id", followupId);
      continue;
    }

    const lead = asLead(row.leads);
    const workspaceId =
      (typeof row.workspace_id === "string" ? row.workspace_id : null) ??
      (lead?.workspace_id ?? null);
    const conversationId =
      (typeof row.conversation_id === "string" ? row.conversation_id : null) ??
      (lead?.conversation_id ?? null);

    let originalMessage = "";
    if (conversationId) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("message, customer_name")
        .eq("id", conversationId)
        .eq("team_id", teamId)
        .maybeSingle();
      originalMessage = typeof conv?.message === "string" ? conv.message : "";
    }

    try {
      const { draft } = await draftReply({
        customerName: lead?.customer_name ?? undefined,
        originalMessage:
          originalMessage ||
          "This is a follow-up on an unanswered inquiry. Please draft a short, polite check-in.",
        classification: {
          intent_type: lead?.intent ?? "other",
          follow_up: true,
        },
        teamId,
        workspaceId,
        supabase,
      });

      const { error: draftErr } = await supabase.from("reply_drafts").insert({
        lead_id: lead?.id ?? row.lead_id,
        conversation_id: conversationId,
        team_id: teamId,
        workspace_id: workspaceId,
        draft_text: draft.reply_text.trim(),
        confidence: 0.75,
        approval_status: "pending",
        status: "pending_approval",
      });
      if (draftErr) throw new Error(draftErr.message);

      await supabase.from("followups").update({ status: "drafted" }).eq("id", followupId);
      await supabase.from("workflow_logs").insert({
        team_id: teamId,
        workspace_id: workspaceId,
        workflow_name: "followup",
        step: "followup_draft_created",
        result: "success",
        payload: { lead_id: lead?.id ?? null, followup_id: followupId },
        timestamp: new Date().toISOString(),
      });
      processed += 1;
    } catch (err) {
      failed += 1;
      await supabase.from("followups").update({ status: "pending" }).eq("id", followupId);
      await supabase.from("workflow_logs").insert({
        team_id: teamId,
        workspace_id: workspaceId,
        workflow_name: "followup",
        step: "followup_draft_failed",
        result: "error",
        payload: { followup_id: followupId },
        error: err instanceof Error ? err.message.slice(0, 2000) : "draft failed",
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { claimed: rows.length, processed, failed, skipped: false };
}
