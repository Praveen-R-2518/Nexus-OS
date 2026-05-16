import type { PostgrestError } from "@supabase/supabase-js";
import type {
  Conversation,
  ReplyDraft,
  ReplyDraftWithConversation,
} from "@/types";
import { MOCK_CONVERSATIONS, MOCK_REPLY_DRAFTS } from "@/lib/mock-inbox-data";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function mockDataSetting(): string {
  return process.env.NEXUS_USE_MOCK_DATA?.trim().toLowerCase() ?? "";
}

/** Explicit opt-in to mock data in any environment */
export function isMockDataForced(): boolean {
  const v = mockDataSetting();
  return v === "1" || v === "true" || v === "yes";
}

export function isMockDataDisabled(): boolean {
  const v = mockDataSetting();
  return v === "0" || v === "false" || v === "no";
}

/** Auto-mock in development when Supabase server credentials are not set */
export function isMockDataAutoDev(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  if (isMockDataDisabled()) return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return !url || !key;
}

export function shouldUseMockConversations(): boolean {
  return isMockDataForced() || isMockDataAutoDev();
}

export function shouldUseDevelopmentMockFallback(): boolean {
  return process.env.NODE_ENV === "development" && !isMockDataDisabled();
}

/** Keep the demo useful in development before Supabase seed data lands. */
export function shouldFallbackToMockAfterEmptyLiveData(): boolean {
  return shouldUseDevelopmentMockFallback();
}

export function shouldFallbackToMockAfterSupabaseError(
  error: PostgrestError,
): boolean {
  void error;
  return shouldUseDevelopmentMockFallback();
}

type ListQuery = {
  limit: number;
  offset: number;
  status: string | null;
  intent: string | null;
  urgency: string | null;
};

export function parseListQuery(searchParams: URLSearchParams): {
  ok: true;
  query: ListQuery;
} | {
  ok: false;
  status: number;
  error: string;
} {
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit =
    limitParam === null || limitParam === ""
      ? DEFAULT_LIMIT
      : Number.parseInt(limitParam, 10);
  const offset =
    offsetParam === null || offsetParam === ""
      ? 0
      : Number.parseInt(offsetParam, 10);

  if (!Number.isFinite(limit) || limit < 1) {
    return { ok: false, status: 400, error: "limit must be a positive integer" };
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return {
      ok: false,
      status: 400,
      error: "offset must be a non-negative integer",
    };
  }
  if (limit > MAX_LIMIT) {
    return {
      ok: false,
      status: 400,
      error: `limit must not exceed ${MAX_LIMIT}`,
    };
  }

  return {
    ok: true,
    query: {
      limit,
      offset,
      status: searchParams.get("status"),
      intent: searchParams.get("intent"),
      urgency: searchParams.get("urgency"),
    },
  };
}

function matchesFilters(
  c: Conversation,
  status: string | null,
  intent: string | null,
  urgency: string | null,
): boolean {
  if (status && status.length > 0 && c.status !== status) return false;
  if (intent && intent.length > 0 && c.intent !== intent) return false;
  if (urgency && urgency.length > 0 && c.urgency !== urgency) return false;
  return true;
}

function sortConversations(rows: Conversation[]): Conversation[] {
  return [...rows].sort((a, b) => {
    if (b.risk_score !== a.risk_score) return b.risk_score - a.risk_score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function mockConversationsListResult(
  searchParams: URLSearchParams,
): { data: Conversation[]; count: number } {
  const parsed = parseListQuery(searchParams);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const { limit, offset, status, intent, urgency } = parsed.query;

  const filtered = MOCK_CONVERSATIONS.filter((c) =>
    matchesFilters(c, status, intent, urgency),
  );
  const sorted = sortConversations(filtered);
  const count = sorted.length;
  const page = sorted.slice(offset, offset + limit);
  return { data: page, count };
}

export function mockConversationById(
  id: string,
): { conversation: Conversation; drafts: ReplyDraft[] } | null {
  const conversation = MOCK_CONVERSATIONS.find((c) => c.id === id) ?? null;
  if (!conversation) return null;
  const drafts = MOCK_REPLY_DRAFTS.filter(
    (d) => d.conversation_id === conversation.id,
  );
  return { conversation, drafts };
}

export function mockReplyDraftById(id: string): ReplyDraft | null {
  return MOCK_REPLY_DRAFTS.find((draft) => draft.id === id) ?? null;
}

const DRAFT_STATUS: ReadonlyArray<ReplyDraft["approval_status"]> = [
  "pending",
  "approved",
  "rejected",
];

/**
 * Demo reply drafts for GET /api/reply-drafts when Supabase is not configured
 * or mock mode is forced (same conditions as conversations mock).
 */
export function mockReplyDraftsListResult(
  searchParams: URLSearchParams,
): ReplyDraftWithConversation[] {
  const statusParam = searchParams.get("status");
  const conversationIdRaw = searchParams.get("conversation_id");
  const conversationId =
    conversationIdRaw === null ? null : conversationIdRaw.trim();

  if (
    statusParam !== null &&
    statusParam !== "" &&
    !DRAFT_STATUS.includes(statusParam as ReplyDraft["approval_status"])
  ) {
    throw new Error("Invalid status (use pending, approved, or rejected)");
  }
  if (conversationIdRaw !== null && conversationId === "") {
    throw new Error("conversation_id must not be empty when provided");
  }

  const convById = new Map(MOCK_CONVERSATIONS.map((c) => [c.id, c]));
  let rows = MOCK_REPLY_DRAFTS.map((d): ReplyDraftWithConversation => {
    const c = convById.get(d.conversation_id);
    return {
      ...d,
      conversation: {
        customer_name: c?.customer_name ?? "",
        risk_score: c?.risk_score ?? 0,
        estimated_value: c?.estimated_value ?? 0,
      },
    };
  });

  if (statusParam && statusParam.length > 0) {
    rows = rows.filter((r) => r.approval_status === statusParam);
  }
  if (conversationId && conversationId.length > 0) {
    rows = rows.filter((r) => r.conversation_id === conversationId);
  }

  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}
