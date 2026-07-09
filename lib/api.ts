import type {
  Conversation,
  DailyReport,
  Metrics,
  ReplyDraftWithConversation,
} from "@/types";

function resolveFetchUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const origin =
    typeof window !== "undefined"
      ? ""
      : process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorFromResponse(
  endpoint: string,
  response: Response,
  body: unknown,
): Error {
  const detail =
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
      ? (body as { error: string }).error
      : typeof body === "string"
        ? body
        : response.statusText || "Unknown error";
  return new Error(
    `API request failed (${endpoint}): ${response.status} ${detail}`,
  );
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = resolveFetchUrl(path);
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error calling ${path}: ${message}`);
  }

  const parsed = await parseJsonSafe(response);

  if (!response.ok) {
    throw errorFromResponse(path, response, parsed);
  }

  return parsed as T;
}

/** Normalize a path so POSTs target `/api/*` on this app */
export function normalizeWebhookPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("sendWebhook: path must not be empty");
  }
  const withoutLeadingSlash = trimmed.replace(/^\/+/, "");
  if (withoutLeadingSlash.startsWith("api/")) {
    return `/${withoutLeadingSlash}`;
  }
  return `/api/${withoutLeadingSlash}`;
}

export async function fetchConversations(): Promise<Conversation[]> {
  const json = await requestJson<{ data: Conversation[] }>("/api/conversations");
  if (!Array.isArray(json.data)) {
    throw new Error(
      "fetchConversations: invalid response shape (expected { data: Conversation[] })",
    );
  }
  return json.data;
}

export async function fetchReplyDrafts(
  status?: string,
  conversationId?: string,
): Promise<ReplyDraftWithConversation[]> {
  const params = new URLSearchParams();
  if (status !== undefined && status !== "") {
    params.set("status", status);
  }
  if (conversationId !== undefined && conversationId !== "") {
    params.set("conversation_id", conversationId);
  }
  const qs = params.toString();
  const json = await requestJson<{ data: ReplyDraftWithConversation[] }>(
    `/api/reply-drafts${qs ? `?${qs}` : ""}`,
  );
  if (!Array.isArray(json.data)) {
    throw new Error(
      "fetchReplyDrafts: invalid response shape (expected { data: ReplyDraftWithConversation[] })",
    );
  }
  return json.data;
}

export async function fetchMetrics(): Promise<Metrics> {
  const json = await requestJson<{ metrics: Metrics }>("/api/metrics");
  if (!json.metrics || typeof json.metrics !== "object") {
    throw new Error(
      "fetchMetrics: invalid response shape (expected { metrics: Metrics })",
    );
  }
  return json.metrics;
}

export async function fetchDailyReport(): Promise<DailyReport | null> {
  const json = await requestJson<{ report: DailyReport | null }>("/api/report");
  if (json.report !== null && typeof json.report !== "object") {
    throw new Error(
      "fetchDailyReport: invalid response shape (expected { report: DailyReport | null })",
    );
  }
  return json.report;
}

export async function approveReply(
  draftId: string,
  draftText?: string,
): Promise<void> {
  await requestJson<{ success: boolean }>("/api/approval", {
    method: "PATCH",
    body: JSON.stringify({
      draft_id: draftId,
      action: "approve",
      draft_text: draftText,
    }),
  });
}

export async function rejectReply(
  draftId: string,
  reason: string,
): Promise<void> {
  await requestJson<{ success: boolean }>("/api/approval", {
    method: "PATCH",
    body: JSON.stringify({
      draft_id: draftId,
      action: "reject",
      rejection_reason: reason,
    }),
  });
}

/** POST helper for internal `/api/*` routes (e.g. forwarding to n8n from a route handler). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- webhook payloads vary by path
export async function sendWebhook(path: string, body: object): Promise<any> {
  const apiPath = normalizeWebhookPath(path);
  return requestJson<unknown>(apiPath, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
