import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import type {
  CsvColumnMapping,
  CsvImportPlan,
} from "@/lib/csv";
import type {
  AiUsageSummary,
  Conversation,
  DailyReport,
  Candidate,
  ConsentStatus,
  Employee,
  EmploymentStatus,
  GithubImportConsentStatus,
  Job,
  JobStatus,
  CandidateJobStage,
  CandidateJobStageCounts,
  JobCandidateListItem,
  PeopleEmailFollowUpApplyResult,
  PeopleEmailFollowUpList,
  PeopleEmailPurpose,
  PeopleEmailRecipientType,
  PeopleEmailTone,
  PeopleMessageDraft,
  TeamAssignee,
  Metrics,
  MetricsTimeseries,
  MetricsTimeseriesRange,
  NotificationPrefs,
  RemotePolicy,
  ReplyDraft,
  ReplyDraftWithConversation,
  ScoringWeights,
  WorkflowLogRow,
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

export async function metricsTimeseriesQuery(
  range: MetricsTimeseriesRange,
): Promise<MetricsTimeseries> {
  const res = await authenticatedFetch(
    `/api/metrics/timeseries?range=${encodeURIComponent(range)}`,
  );
  const json = await readJson<MetricsTimeseries & { error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.points) || typeof json.range !== "string") {
    throw new Error("Invalid metrics timeseries response");
  }
  return { range: json.range as MetricsTimeseriesRange, points: json.points };
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

export interface WorkflowLogsPage {
  data: WorkflowLogRow[];
  count: number;
  limit: number;
  offset: number;
}

export async function workflowLogsQuery(
  result: string,
  offset: number,
  limit = 50,
): Promise<WorkflowLogsPage> {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (result) params.set("result", result);
  const res = await authenticatedFetch(`/api/workflow-logs?${params.toString()}`);
  const json = await readJson<
    { data?: WorkflowLogRow[]; count?: number; limit?: number; offset?: number; error?: string }
  >(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid workflow logs response");
  }
  return {
    data: json.data,
    count: json.count ?? json.data.length,
    limit: json.limit ?? limit,
    offset: json.offset ?? offset,
  };
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
  full_name?: string;
  name?: string;
  industry?: string;
  tone?: string;
  chat_persona?: string;
  services?: string[];
  approval_mode?: "approval_queue" | "autopilot";
  timezone?: string;
  currency?: string;
  pricing_notes?: string;
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

// --- People employees (roster) ------------------------------------------------

export const EMPLOYEES_PAGE_SIZE = 50;

export type EmployeesListParams = {
  q?: string | null;
  employmentStatus?: string | null;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

export type EmployeesListResult = {
  data: Employee[];
  count: number;
};

export type EmployeeWriteBody = {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  role_title?: string | null;
  employment_status?: EmploymentStatus;
  started_on?: string | null;
  ended_on?: string | null;
  location?: string | null;
  notes?: string | null;
  archived?: boolean;
};

export async function employeesQuery(
  params: EmployeesListParams = {},
): Promise<EmployeesListResult> {
  const search = new URLSearchParams();
  const q = params.q?.trim();
  if (q) search.set("q", q.slice(0, 200));
  if (params.employmentStatus) {
    search.set("employment_status", params.employmentStatus);
  }
  if (params.includeArchived) search.set("include_archived", "true");
  search.set("limit", String(params.limit ?? EMPLOYEES_PAGE_SIZE));
  search.set("offset", String(params.offset ?? 0));

  const res = await authenticatedFetch(`/api/people/employees?${search.toString()}`);
  const json = await readJson<{ data?: Employee[]; count?: number; error?: string }>(
    res,
  );
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid employees response");
  }
  return {
    data: json.data,
    count: typeof json.count === "number" ? json.count : json.data.length,
  };
}

export async function employeeQuery(id: string): Promise<Employee> {
  const res = await authenticatedFetch(
    `/api/people/employees/${encodeURIComponent(id)}`,
  );
  const json = await readJson<{ data?: Employee; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid employee response");
  }
  return json.data;
}

export async function createEmployeeMutation(
  body: EmployeeWriteBody,
): Promise<Employee> {
  const res = await authenticatedFetch("/api/people/employees", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<{ data?: Employee; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid employee response");
  }
  return json.data;
}

export async function updateEmployeeMutation(
  id: string,
  body: EmployeeWriteBody,
): Promise<Employee> {
  const res = await authenticatedFetch(
    `/api/people/employees/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{ data?: Employee; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid employee response");
  }
  return json.data;
}

export type EmployeeCsvImportBody = {
  csv: string;
  mapping?: CsvColumnMapping;
};

export type EmployeeCsvImportResult = CsvImportPlan & {
  message?: string;
};

export async function previewEmployeeCsv(
  body: EmployeeCsvImportBody,
): Promise<EmployeeCsvImportResult> {
  const res = await authenticatedFetch("/api/people/employees/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<EmployeeCsvImportResult & { error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (json.ok !== true) throw new Error(json.error ?? "CSV preview failed");
  return json;
}

export async function importEmployeeCsv(
  body: EmployeeCsvImportBody,
): Promise<EmployeeCsvImportResult> {
  const res = await authenticatedFetch("/api/people/employees/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<EmployeeCsvImportResult & { error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (json.ok !== true) throw new Error(json.error ?? "CSV import failed");
  return json;
}

function filenameFromDisposition(header: string | null, fallback = "employees.csv"): string {
  if (!header) return fallback;
  const match = header.match(/filename="([^"]+)"/i);
  const name = match?.[1]?.trim();
  return name || fallback;
}

async function downloadCsvResponse(res: Response, fallback: string): Promise<void> {
  if (!res.ok) {
    const json = await readJson<{ error?: string }>(res);
    throw new Error(errFrom(res, json));
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("content-disposition"), fallback);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportEmployeesCsv(): Promise<void> {
  const res = await authenticatedFetch("/api/people/employees/export");
  await downloadCsvResponse(res, "employees.csv");
}

export async function exportCandidatesCsv(): Promise<void> {
  const res = await authenticatedFetch("/api/people/candidates/export");
  await downloadCsvResponse(res, "candidates.csv");
}

// --- People jobs (open roles) -------------------------------------------------

export const JOBS_PAGE_SIZE = 50;

export type JobsListParams = {
  q?: string | null;
  status?: string | null;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

export type JobsListResult = {
  data: Job[];
  count: number;
};

export type JobWriteBody = {
  title?: string;
  description?: string | null;
  status?: JobStatus;
  required_skills?: string[];
  preferred_skills?: string[];
  experience_min_years?: number | null;
  experience_max_years?: number | null;
  seniority?: string | null;
  location?: string | null;
  remote_policy?: RemotePolicy | null;
  scoring_weights?: ScoringWeights;
  archived?: boolean;
};

export async function jobsQuery(
  params: JobsListParams = {},
): Promise<JobsListResult> {
  const search = new URLSearchParams();
  const q = params.q?.trim();
  if (q) search.set("q", q.slice(0, 200));
  if (params.status) search.set("status", params.status);
  if (params.includeArchived) search.set("include_archived", "true");
  search.set("limit", String(params.limit ?? JOBS_PAGE_SIZE));
  search.set("offset", String(params.offset ?? 0));

  const res = await authenticatedFetch(`/api/people/jobs?${search.toString()}`);
  const json = await readJson<{ data?: Job[]; count?: number; error?: string }>(
    res,
  );
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid jobs response");
  }
  return {
    data: json.data,
    count: typeof json.count === "number" ? json.count : json.data.length,
  };
}

export async function jobQuery(id: string): Promise<Job> {
  const res = await authenticatedFetch(
    `/api/people/jobs/${encodeURIComponent(id)}`,
  );
  const json = await readJson<{ data?: Job; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid job response");
  }
  return json.data;
}

export async function createJobMutation(body: JobWriteBody): Promise<Job> {
  const res = await authenticatedFetch("/api/people/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<{ data?: Job; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid job response");
  }
  return json.data;
}

export async function updateJobMutation(
  id: string,
  body: JobWriteBody,
): Promise<Job> {
  const res = await authenticatedFetch(
    `/api/people/jobs/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{ data?: Job; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid job response");
  }
  return json.data;
}

// --- People candidates (founder-owned) ----------------------------------------

export const CANDIDATES_PAGE_SIZE = 50;

export type CandidatesListParams = {
  q?: string | null;
  consentStatus?: string | null;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
};

export type CandidatesListResult = {
  data: Candidate[];
  count: number;
};

export type CandidateWriteBody = {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  headline?: string | null;
  current_role?: string | null;
  experience_years?: number | null;
  skills?: string[];
  location?: string | null;
  source?: string | null;
  source_url?: string | null;
  consent_status?: ConsentStatus;
  notes?: string | null;
  archived?: boolean;
};

export async function candidatesQuery(
  params: CandidatesListParams = {},
): Promise<CandidatesListResult> {
  const search = new URLSearchParams();
  const q = params.q?.trim();
  if (q) search.set("q", q.slice(0, 200));
  if (params.consentStatus) search.set("consent_status", params.consentStatus);
  if (params.includeArchived) search.set("include_archived", "true");
  search.set("limit", String(params.limit ?? CANDIDATES_PAGE_SIZE));
  search.set("offset", String(params.offset ?? 0));

  const res = await authenticatedFetch(
    `/api/people/candidates?${search.toString()}`,
  );
  const json = await readJson<{ data?: Candidate[]; count?: number; error?: string }>(
    res,
  );
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid candidates response");
  }
  return {
    data: json.data,
    count: typeof json.count === "number" ? json.count : json.data.length,
  };
}

export async function candidateQuery(id: string): Promise<Candidate> {
  const res = await authenticatedFetch(
    `/api/people/candidates/${encodeURIComponent(id)}`,
  );
  const json = await readJson<{ data?: Candidate; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid candidate response");
  }
  return json.data;
}

export async function createCandidateMutation(
  body: CandidateWriteBody,
): Promise<Candidate> {
  const res = await authenticatedFetch("/api/people/candidates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<{ data?: Candidate; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid candidate response");
  }
  return json.data;
}

export async function updateCandidateMutation(
  id: string,
  body: CandidateWriteBody,
): Promise<Candidate> {
  const res = await authenticatedFetch(
    `/api/people/candidates/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{ data?: Candidate; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid candidate response");
  }
  return json.data;
}

// --- Job candidate rankings (D5) ----------------------------------------------

export const JOB_CANDIDATES_PAGE_SIZE = 50;

export type JobCandidatesListParams = {
  limit?: number;
  offset?: number;
  stage?: CandidateJobStage | null;
};

export type JobCandidatesListResult = {
  data: JobCandidateListItem[];
  count: number;
  stage_counts: CandidateJobStageCounts;
  assignees: TeamAssignee[];
};

const EMPTY_STAGE_COUNTS: CandidateJobStageCounts = {
  new: 0,
  shortlisted: 0,
  contacted: 0,
  decision: 0,
};

function parseStageCounts(raw: unknown): CandidateJobStageCounts {
  if (!raw || typeof raw !== "object") return { ...EMPTY_STAGE_COUNTS };
  const record = raw as Record<string, unknown>;
  return {
    new: typeof record.new === "number" ? record.new : 0,
    shortlisted: typeof record.shortlisted === "number" ? record.shortlisted : 0,
    contacted: typeof record.contacted === "number" ? record.contacted : 0,
    decision: typeof record.decision === "number" ? record.decision : 0,
  };
}

function parseAssignees(raw: unknown): TeamAssignee[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamAssignee[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; full_name?: unknown };
    if (typeof row.id !== "string" || !row.id) continue;
    out.push({
      id: row.id,
      full_name: typeof row.full_name === "string" ? row.full_name : null,
    });
  }
  return out;
}

export async function jobCandidatesQuery(
  jobId: string,
  params: JobCandidatesListParams = {},
): Promise<JobCandidatesListResult> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? JOB_CANDIDATES_PAGE_SIZE));
  search.set("offset", String(params.offset ?? 0));
  if (params.stage) search.set("stage", params.stage);

  const res = await authenticatedFetch(
    `/api/people/jobs/${encodeURIComponent(jobId)}/candidates?${search.toString()}`,
  );
  const json = await readJson<{
    data?: JobCandidateListItem[];
    count?: number;
    stage_counts?: CandidateJobStageCounts;
    assignees?: TeamAssignee[];
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid job candidates response");
  }
  return {
    data: json.data,
    count: typeof json.count === "number" ? json.count : json.data.length,
    stage_counts: parseStageCounts(json.stage_counts),
    assignees: parseAssignees(json.assignees),
  };
}

export async function updateCandidateJobOverrideMutation(
  applicationId: string,
  manualRankOverride: number | null,
): Promise<JobCandidateListItem> {
  const res = await authenticatedFetch(
    `/api/people/candidate-jobs/${encodeURIComponent(applicationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual_rank_override: manualRankOverride }),
    },
  );
  const json = await readJson<{ data?: JobCandidateListItem; error?: string }>(
    res,
  );
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid application response");
  }
  return json.data;
}

export type CandidateJobPipelineBody = {
  stage?: CandidateJobStage;
  assigned_to?: string | null;
};

export async function updateCandidateJobPipelineMutation(
  applicationId: string,
  body: CandidateJobPipelineBody,
): Promise<JobCandidateListItem> {
  const res = await authenticatedFetch(
    `/api/people/candidate-jobs/${encodeURIComponent(applicationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{ data?: JobCandidateListItem; error?: string }>(
    res,
  );
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid application response");
  }
  return json.data;
}

export type BulkCandidateJobStageBody = {
  ids: string[];
  stage: CandidateJobStage;
  assigned_to?: string | null;
};

export type BulkCandidateJobStageResult = {
  data: JobCandidateListItem[];
  skipped: number;
};

export async function bulkUpdateCandidateJobStageMutation(
  jobId: string,
  body: BulkCandidateJobStageBody,
): Promise<BulkCandidateJobStageResult> {
  const res = await authenticatedFetch(
    `/api/people/jobs/${encodeURIComponent(jobId)}/candidates/stage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{
    data?: JobCandidateListItem[];
    skipped?: number;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!Array.isArray(json.data)) {
    throw new Error("Invalid bulk stage response");
  }
  return {
    data: json.data,
    skipped: typeof json.skipped === "number" ? json.skipped : 0,
  };
}

export type CandidateCsvImportBody = {
  csv: string;
  job_id: string;
  mapping?: CsvColumnMapping;
};

export type CandidateCsvImportResult = CsvImportPlan & {
  message?: string;
  attached?: number;
};

export async function previewCandidateCsv(
  body: CandidateCsvImportBody,
): Promise<CandidateCsvImportResult> {
  const res = await authenticatedFetch("/api/people/candidates/import/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<CandidateCsvImportResult & { error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (json.ok !== true) throw new Error(json.error ?? "CSV preview failed");
  return json;
}

export async function importCandidateCsv(
  body: CandidateCsvImportBody,
): Promise<CandidateCsvImportResult> {
  const res = await authenticatedFetch("/api/people/candidates/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<CandidateCsvImportResult & { error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (json.ok !== true) throw new Error(json.error ?? "CSV import failed");
  return json;
}

export type CandidateFromSourceBody = {
  source: "github";
  ref: string;
  consent_status: GithubImportConsentStatus;
  job_id?: string;
};

export type CandidateFromSourceResult = {
  data: Candidate;
  created: boolean;
  attached: boolean;
};

export async function importCandidateFromSource(
  body: CandidateFromSourceBody,
): Promise<CandidateFromSourceResult> {
  const res = await authenticatedFetch("/api/people/candidates/from-source", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<CandidateFromSourceResult & { error?: string }>(
    res,
  );
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid GitHub import response");
  }
  return {
    data: json.data,
    created: json.created === true,
    attached: json.attached === true,
  };
}

export const PEOPLE_EMAIL_PICKER_LIMIT = 100;

export type PeopleEmailGenerateBody = {
  recipient_type: PeopleEmailRecipientType;
  recipient_id: string;
  purpose: PeopleEmailPurpose;
  tone: PeopleEmailTone;
  situation: string;
  facts?: string[];
  related_date?: string | null;
};

export type PeopleEmailLetterBody = {
  subject?: string;
  body?: string;
};

export async function generatePeopleEmailDraft(
  body: PeopleEmailGenerateBody,
): Promise<PeopleMessageDraft> {
  const res = await authenticatedFetch("/api/people/email/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await readJson<{ data?: PeopleMessageDraft; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid email draft response");
  }
  return json.data;
}

export async function updatePeopleEmailDraft(
  id: string,
  body: PeopleEmailLetterBody,
): Promise<PeopleMessageDraft> {
  const res = await authenticatedFetch(
    `/api/people/email/drafts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{ data?: PeopleMessageDraft; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid email draft response");
  }
  return json.data;
}

export async function sendPeopleEmailDraft(
  id: string,
  body: PeopleEmailLetterBody = {},
): Promise<PeopleMessageDraft> {
  const res = await authenticatedFetch(
    `/api/people/email/drafts/${encodeURIComponent(id)}/send`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{ data?: PeopleMessageDraft; error?: string }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid email send response");
  }
  return json.data;
}

export type PeopleEmailFollowUpApplyBody =
  | {
      kind: "set_employment_status";
      employment_status: "resignation_pending" | "offboarded";
    }
  | {
      kind: "set_candidate_job_stage";
      candidate_job_id: string;
      stage: "contacted";
    };

export async function peopleEmailFollowUpQuery(
  id: string,
): Promise<PeopleEmailFollowUpList> {
  const res = await authenticatedFetch(
    `/api/people/email/drafts/${encodeURIComponent(id)}/follow-up`,
  );
  const json = await readJson<{
    data?: PeopleEmailFollowUpList;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object" || !Array.isArray(json.data.proposals)) {
    throw new Error("Invalid follow-up response");
  }
  return json.data;
}

export async function applyPeopleEmailFollowUp(
  id: string,
  body: PeopleEmailFollowUpApplyBody,
): Promise<PeopleEmailFollowUpApplyResult> {
  const res = await authenticatedFetch(
    `/api/people/email/drafts/${encodeURIComponent(id)}/follow-up`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const json = await readJson<{
    data?: PeopleEmailFollowUpApplyResult;
    error?: string;
  }>(res);
  if (!res.ok) throw new Error(errFrom(res, json));
  if (!json.data || typeof json.data !== "object") {
    throw new Error("Invalid follow-up apply response");
  }
  return json.data;
}
