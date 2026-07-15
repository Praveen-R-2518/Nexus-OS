import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type {
  AiUsageSummary,
  Conversation,
  DailyReport,
  Metrics,
  NotificationPrefs,
  ReplyDraft,
  ReplyDraftWithConversation,
  WorkspaceSettings,
} from "@/types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function errFrom(res: Response, body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return res.statusText;
}

export async function conversationsQuery(limit: number): Promise<Conversation[]> {
  const res = await authenticatedFetch(`/api/conversations?limit=${limit}`);
  const json = await readJson<{ data?: Conversation[]; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid conversations response");
  }
  return json.data;
}

export async function metricsQuery(): Promise<Metrics> {
  const res = await authenticatedFetch("/api/metrics");
  const json = await readJson<{ metrics?: Metrics; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.metrics || typeof json.metrics !== "object") {
    throw new Error("Invalid metrics response");
  }
  return json.metrics;
}

export async function replyDraftsQuery(
  status?: string,
  conversationId?: string,
): Promise<ReplyDraftWithConversation[]> {
  const params = new URLSearchParams();
  if (status !== undefined && status !== "") params.set("status", status);
  if (conversationId !== undefined && conversationId !== "") {
    params.set("conversation_id", conversationId);
  }
  const qs = params.toString();
  const res = await authenticatedFetch(`/api/reply-drafts${qs ? `?${qs}` : ""}`);
  const json = await readJson<{ data?: ReplyDraftWithConversation[]; error?: string }>(
    res,
  );
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid reply drafts response");
  }
  return json.data;
}

export async function dailyReportQuery(): Promise<DailyReport | null> {
  const res = await authenticatedFetch("/api/report");
  const json = await readJson<{ report: DailyReport | null; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (json.report !== null && typeof json.report !== "object") {
    throw new Error("Invalid report response");
  }
  return json.report;
}

export async function aiUsageQuery(): Promise<AiUsageSummary> {
  const res = await authenticatedFetch("/api/ai-usage");
  const json = await readJson<{ usage?: AiUsageSummary; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.usage || typeof json.usage !== "object") {
    throw new Error("Invalid AI usage response");
  }
  return json.usage;
}

export async function conversationDraftsQuery(id: string): Promise<ReplyDraft[]> {
  const res = await authenticatedFetch(
    `/api/conversations/${encodeURIComponent(id)}`,
  );
  const json = await readJson<{ drafts?: ReplyDraft[]; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  return Array.isArray(json.drafts) ? json.drafts : [];
}

export async function settingsQuery(): Promise<WorkspaceSettings> {
  const res = await authenticatedFetch("/api/settings");
  const json = await readJson<{ settings?: WorkspaceSettings; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.settings || typeof json.settings !== "object") {
    throw new Error("Invalid settings response");
  }
  return json.settings;
}

export type SettingsPatchInput = {
  name?: string;
  industry?: string;
  tone?: string;
  chat_persona?: string;
  services?: string[];
  approval_mode?: "approval_queue" | "autopilot";
  timezone?: string;
  currency?: string;
  high_value_threshold?: number;
  high_risk_score?: number;
  chat_visuals_enabled?: boolean;
  ai_monthly_token_budget?: number | null;
  notification_prefs?: Partial<NotificationPrefs>;
  channel?: {
    target: "gmail" | "whatsapp" | "instagram" | "facebook";
    action: "set_sync" | "disconnect";
    sync_enabled?: boolean;
  };
};

export async function updateSettingsMutation(
  patch: SettingsPatchInput,
): Promise<WorkspaceSettings> {
  const res = await authenticatedFetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = await readJson<{ settings?: WorkspaceSettings; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.settings || typeof json.settings !== "object") {
    throw new Error("Invalid settings response");
  }
  return json.settings;
}

// --- Chat personalization: AI enhance -----------------------------------------

export async function enhancePersona(text: string): Promise<string> {
  const res = await authenticatedFetch("/api/settings/enhance-persona", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json = await readJson<{ enhanced?: string; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (typeof json.enhanced !== "string" || !json.enhanced.trim()) {
    throw new Error("Invalid enhance response");
  }
  return json.enhanced;
}

// --- Business knowledge documents (vector store ingest) -----------------------

export type BusinessDocument = {
  id: string;
  file_name: string;
  mime_type: string;
  char_count: number;
  chunk_count: number;
  status: "processing" | "ready" | "failed";
  error: string | null;
  created_at: string;
};

export async function businessDocsQuery(): Promise<BusinessDocument[]> {
  const res = await authenticatedFetch("/api/business-docs");
  const json = await readJson<{ documents?: BusinessDocument[]; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  return Array.isArray(json.documents) ? json.documents : [];
}

export async function uploadBusinessDoc(file: File): Promise<BusinessDocument> {
  const form = new FormData();
  form.append("file", file);
  const res = await authenticatedFetch("/api/business-docs", {
    method: "POST",
    body: form,
  });
  const json = await readJson<{ document?: BusinessDocument; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.document || typeof json.document !== "object") {
    throw new Error("Invalid upload response");
  }
  return json.document;
}

export async function deleteBusinessDoc(id: string): Promise<void> {
  const res = await authenticatedFetch(
    `/api/business-docs?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const json = await readJson<{ error?: string }>(res);
    throw new Error(errFrom(res, json));
  }
}
