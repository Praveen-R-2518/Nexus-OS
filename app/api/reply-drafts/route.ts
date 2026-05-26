import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";
import { requireApiTenantContext } from "@/lib/api-security";
import type { ReplyDraft, ReplyDraftWithConversation } from "@/types";

export const dynamic = "force-dynamic";

const APPROVAL_STATUSES: ReadonlyArray<ReplyDraft["approval_status"]> = [
  "pending",
  "approved",
  "rejected",
];

type ReplyDraftRow = ReplyDraft & {
  conversations: {
    customer_name: string;
    risk_score: number;
    estimated_value: number;
  } | null;
};

function mapRowsToReplyDraftWithConversation(
  rows: ReplyDraftRow[],
): ReplyDraftWithConversation[] {
  return rows.map((row) => {
    const { conversations: conv, ...draft } = row;
    return {
      ...draft,
      conversation: {
        customer_name: conv?.customer_name ?? "",
        risk_score: conv?.risk_score ?? 0,
        estimated_value: conv?.estimated_value ?? 0,
      },
    };
  });
}

function isRelationshipEmbedError(error: PostgrestError): boolean {
  const msg = (error.message ?? "").toLowerCase();
  const code = error.code ?? "";
  return (
    code === "PGRST200" ||
    msg.includes("could not find a relationship") ||
    msg.includes("no relationship found") ||
    (msg.includes("relationship") && msg.includes("schema cache"))
  );
}

export async function GET(request: Request) {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId } = tenant;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const conversationIdRaw = searchParams.get("conversation_id");
  const conversationId =
    conversationIdRaw === null ? null : conversationIdRaw.trim();

  if (
    statusParam !== null &&
    statusParam !== "" &&
    !APPROVAL_STATUSES.includes(statusParam as ReplyDraft["approval_status"])
  ) {
    return NextResponse.json(
      { error: "Invalid status (use pending, approved, or rejected)" },
      { status: 400 },
    );
  }

  if (conversationIdRaw !== null && conversationId === "") {
    return NextResponse.json(
      { error: "conversation_id must not be empty when provided" },
      { status: 400 },
    );
  }

  const draftColumnsWithConversationEmbed =
    "*,conversations(customer_name,risk_score,estimated_value)";

  let qEmbed = supabase
    .from("reply_drafts")
    .select(draftColumnsWithConversationEmbed)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (statusParam && statusParam.length > 0) {
    qEmbed = qEmbed.eq("approval_status", statusParam);
  }
  if (conversationId && conversationId.length > 0) {
    qEmbed = qEmbed.eq("conversation_id", conversationId);
  }

  let { data, error } = await qEmbed;

  if (error && isRelationshipEmbedError(error)) {
    let qPlain = supabase
      .from("reply_drafts")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (statusParam && statusParam.length > 0) {
      qPlain = qPlain.eq("approval_status", statusParam);
    }
    if (conversationId && conversationId.length > 0) {
      qPlain = qPlain.eq("conversation_id", conversationId);
    }

    const second = await qPlain;
    data = second.data;
    error = second.error;

    if (!error && data) {
      const plain = data as ReplyDraft[];
      const dataOut: ReplyDraftWithConversation[] = plain.map((draft) => ({
        ...draft,
        conversation: {
          customer_name: "",
          risk_score: 0,
          estimated_value: 0,
        },
      }));

      return NextResponse.json({ data: dataOut, source: "live" });
    }
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ReplyDraftRow[];
  const dataOut = mapRowsToReplyDraftWithConversation(rows);

  return NextResponse.json({ data: dataOut, source: "live" });
}
