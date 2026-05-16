import type { PostgrestError } from "@supabase/supabase-js";
import type { Conversation, ReplyDraft } from "@/types";
import { MOCK_CONVERSATIONS, MOCK_REPLY_DRAFTS } from "@/lib/mock-inbox-data";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/** Explicit opt-in to mock data in any environment */
export function isMockDataForced(): boolean {
  const v = process.env.NEXUS_USE_MOCK_DATA?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Auto-mock in development when Supabase server credentials are not set */
export function isMockDataAutoDev(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return !url || !key;
}

export function shouldUseMockConversations(): boolean {
  return isMockDataForced() || isMockDataAutoDev();
}

export function shouldFallbackToMockAfterSupabaseError(
  error: PostgrestError,
): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const off = process.env.NEXUS_USE_MOCK_DATA?.trim().toLowerCase();
  if (off === "0" || off === "false" || off === "no") return false;

  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();

  if (code === "PGRST205") return true;
  if (code === "42P01") return true;
  if (msg.includes("does not exist") && msg.includes("relation")) return true;
  if (msg.includes("schema cache")) return true;
  if (msg.includes("could not find the table")) return true;

  return false;
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
