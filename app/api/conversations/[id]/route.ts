import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import type { Conversation, ReplyDraft } from "@/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const id = context.params?.id?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const {
    data: conversationRow,
    error: conversationError,
  } = await supabase.from("conversations").select("*").eq("id", id).single();

  if (conversationError) {
    if (conversationError.code === "PGRST116") {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: conversationError.message },
      { status: 500 },
    );
  }

  const {
    data: draftRows,
    error: draftsError,
  } = await supabase
    .from("reply_drafts")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false });

  if (draftsError) {
    return NextResponse.json(
      { error: draftsError.message },
      { status: 500 },
    );
  }

  const conversation = conversationRow as Conversation;
  const drafts = (draftRows ?? []) as ReplyDraft[];

  return NextResponse.json({ conversation, drafts });
}
