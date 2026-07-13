import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type {
  Conversation,
  DailyReport,
  Metrics,
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
  services?: string[];
  approval_mode?: "approval_queue" | "autopilot";
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
