export const queryKeys = {
  conversations: (limit: number) => ["conversations", limit] as const,
  metrics: () => ["metrics"] as const,
  replyDrafts: (status?: string, conversationId?: string) =>
    ["replyDrafts", status ?? "", conversationId ?? ""] as const,
  dailyReport: () => ["dailyReport"] as const,
  workflowLogs: (filter: string) => ["workflowLogs", filter] as const,
  conversationDetail: (id: string) => ["conversationDetail", id] as const,
} as const;
