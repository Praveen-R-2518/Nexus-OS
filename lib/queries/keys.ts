/** Placeholder segment when profile has no team_id (queries disabled). */
export const TENANT_QUERY_NONE = "__no_team__" as const;

export const queryKeys = {
  root: (teamId: string | null) =>
    ["tenant", teamId ?? TENANT_QUERY_NONE] as const,

  conversations: (teamId: string | null, limit: number) =>
    [...queryKeys.root(teamId), "conversations", limit] as const,

  metrics: (teamId: string | null) => [...queryKeys.root(teamId), "metrics"] as const,

  metricsTimeseries: (teamId: string | null, range: string) =>
    [...queryKeys.root(teamId), "metricsTimeseries", range] as const,

  replyDrafts: (teamId: string | null, status?: string, conversationId?: string) =>
    [
      ...queryKeys.root(teamId),
      "replyDrafts",
      status ?? "",
      conversationId ?? "",
    ] as const,

  dailyReport: (teamId: string | null) =>
    [...queryKeys.root(teamId), "dailyReport"] as const,

  conversationDetail: (teamId: string | null, id: string) =>
    [...queryKeys.root(teamId), "conversationDetail", id] as const,

  settings: (teamId: string | null) =>
    [...queryKeys.root(teamId), "settings"] as const,

  businessDocs: (teamId: string | null) =>
    [...queryKeys.root(teamId), "businessDocs"] as const,

  aiUsage: (teamId: string | null) =>
    [...queryKeys.root(teamId), "aiUsage"] as const,

  workflowLogs: (teamId: string | null, resultFilter: string, offset: number) =>
    [...queryKeys.root(teamId), "workflowLogs", resultFilter, offset] as const,

  employees: (
    teamId: string | null,
    q: string,
    employmentStatus: string,
    includeArchived: boolean,
    limit: number,
    offset: number,
  ) =>
    [
      ...queryKeys.root(teamId),
      "employees",
      q,
      employmentStatus,
      includeArchived,
      limit,
      offset,
    ] as const,

  employee: (teamId: string | null, id: string) =>
    [...queryKeys.root(teamId), "employee", id] as const,

  jobs: (
    teamId: string | null,
    q: string,
    status: string,
    includeArchived: boolean,
    limit: number,
    offset: number,
  ) =>
    [
      ...queryKeys.root(teamId),
      "jobs",
      q,
      status,
      includeArchived,
      limit,
      offset,
    ] as const,

  job: (teamId: string | null, id: string) =>
    [...queryKeys.root(teamId), "job", id] as const,

  candidates: (
    teamId: string | null,
    q: string,
    consentStatus: string,
    includeArchived: boolean,
    limit: number,
    offset: number,
  ) =>
    [
      ...queryKeys.root(teamId),
      "candidates",
      q,
      consentStatus,
      includeArchived,
      limit,
      offset,
    ] as const,

  candidate: (teamId: string | null, id: string) =>
    [...queryKeys.root(teamId), "candidate", id] as const,

  jobCandidates: (
    teamId: string | null,
    jobId: string,
    limit: number,
    offset: number,
    stage: string,
  ) =>
    [
      ...queryKeys.root(teamId),
      "job-candidates",
      jobId,
      limit,
      offset,
      stage,
    ] as const,

  peopleEmailDraft: (teamId: string | null, id: string) =>
    [...queryKeys.root(teamId), "people-email-draft", id] as const,

  peopleEmailFollowUp: (teamId: string | null, id: string) =>
    [...queryKeys.root(teamId), "people-email-follow-up", id] as const,
} as const;
