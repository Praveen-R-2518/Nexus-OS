import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { Conversation, ReplyDraft } from "@/types";
import {
  mockConversationById,
  shouldFallbackToMockAfterEmptyLiveData,
  shouldFallbackToMockAfterSupabaseError,
  shouldUseMockConversations,
} from "@/lib/conversations-mock";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

export async function GET(_request: Request, context: RouteContext) {
  const id = context.params?.id?.trim();

  if (!id) {
    return NextResponse.json({ error: "Missing conversation id" }, { status: 400 });
  }

  if (shouldUseMockConversations()) {
    const found = mockConversationById(id);
    if (!found) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      conversation: found.conversation,
      drafts: found.drafts,
      source: "mock",
    });
  }

  let supabase;
  try {
    supabase = createServerClient();
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
      if (shouldFallbackToMockAfterEmptyLiveData()) {
        const found = mockConversationById(id);
        if (found) {
          return NextResponse.json({
            conversation: found.conversation,
            drafts: found.drafts,
            source: "mock",
          });
        }
      }
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }
    if (shouldFallbackToMockAfterSupabaseError(conversationError)) {
      const found = mockConversationById(id);
      if (found) {
        return NextResponse.json({
          conversation: found.conversation,
          drafts: found.drafts,
          source: "mock",
        });
      }
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
    if (shouldFallbackToMockAfterSupabaseError(draftsError)) {
      const found = mockConversationById(id);
      if (found) {
        return NextResponse.json({
          conversation: found.conversation,
          drafts: found.drafts,
          source: "mock",
        });
      }
    }
    return NextResponse.json(
      { error: draftsError.message },
      { status: 500 },
    );
  }

  const conversation = conversationRow as Conversation;
  const drafts = (draftRows ?? []) as ReplyDraft[];

  return NextResponse.json({ conversation, drafts, source: "live" });
}
