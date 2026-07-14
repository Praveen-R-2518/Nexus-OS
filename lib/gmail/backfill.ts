import "server-only";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
export const DEFAULT_BATCH_SIZE = 50;

export interface GmailListResult {
  messageIds: string[];
  nextPageToken: string | null;
}

export interface GmailIntakePayload {
  __source: "gmail";
  subject: string;
  from: { text: string };
  to: string;
  textPlain: string;
  threadId: string;
  date: string;
  headers: {
    "message-id": string;
    subject: string;
    from: string;
    to: string;
  };
}

type GmailMessageListResponse = {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMessagePart[];
};

type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  payload?: GmailMessagePart & {
    headers?: Array<{ name?: string; value?: string }>;
  };
};

function formatGmailAfterQuery(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() - 90);
    return formatGmailAfterQuery(fallback.toISOString());
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function headerValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string {
  if (!headers) return "";
  const hit = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return hit?.value?.trim() ?? "";
}

function extractPlainText(part: GmailMessagePart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) {
      const text = extractPlainText(child);
      if (text) return text;
    }
  }
  return "";
}

function normalizeMessageId(raw: string, fallbackId: string): string {
  const trimmed = raw.trim();
  if (trimmed) return trimmed;
  return `<gmail-${fallbackId}@nexus-backfill.local>`;
}

export async function listGmailMessageIds(
  accessToken: string,
  input: { afterDate: string; pageToken?: string | null; maxResults?: number },
  fetchFn: typeof fetch = fetch,
): Promise<GmailListResult> {
  const params = new URLSearchParams({
    maxResults: String(input.maxResults ?? DEFAULT_BATCH_SIZE),
    q: `after:${formatGmailAfterQuery(input.afterDate)} in:inbox`,
  });
  if (input.pageToken) params.set("pageToken", input.pageToken);

  const res = await fetchFn(`${GMAIL_API}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) {
    throw new Error("gmail_rate_limited");
  }
  if (!res.ok) {
    throw new Error(`gmail_list_failed:${res.status}`);
  }

  const json = (await res.json()) as GmailMessageListResponse;
  return {
    messageIds: (json.messages ?? []).map((m) => m.id).filter(Boolean),
    nextPageToken: json.nextPageToken ?? null,
  };
}

export async function fetchGmailMessage(
  accessToken: string,
  messageId: string,
  fetchFn: typeof fetch = fetch,
): Promise<GmailMessageResponse | null> {
  const res = await fetchFn(`${GMAIL_API}/messages/${encodeURIComponent(messageId)}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 429) throw new Error("gmail_rate_limited");
  if (!res.ok) return null;

  return (await res.json()) as GmailMessageResponse;
}

export function gmailMessageToIntakePayload(
  message: GmailMessageResponse,
  destinationEmail: string,
): GmailIntakePayload | null {
  const id = message.id?.trim();
  if (!id) return null;

  const headers = message.payload?.headers ?? [];
  const subject = headerValue(headers, "Subject") || "(no subject)";
  const from = headerValue(headers, "From") || "unknown@unknown";
  const messageId = normalizeMessageId(headerValue(headers, "Message-ID"), id);
  const textPlain = extractPlainText(message.payload) || subject;
  const internalDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();

  return {
    __source: "gmail",
    subject,
    from: { text: from },
    to: destinationEmail,
    textPlain,
    threadId: message.threadId ?? id,
    date: internalDate,
    headers: {
      "message-id": messageId,
      subject,
      from,
      to: destinationEmail,
    },
  };
}
