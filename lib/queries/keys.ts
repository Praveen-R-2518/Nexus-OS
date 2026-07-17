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
} as const;
