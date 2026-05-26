import type { QueryClient } from "@tanstack/react-query";
import {
  conversationsQuery,
  dailyReportQuery,
  metricsQuery,
  replyDraftsQuery,
  workflowLogsWithMetaQuery,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";

const STALE = 30_000;
const REPORT_STALE = 60_000;

export function prefetchNavRoute(queryClient: QueryClient, href: string): void {
  if (href === "/dashboard" || href.startsWith("/dashboard")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.metrics(),
      queryFn: metricsQuery,
      staleTime: STALE,
    });
    return;
  }

  if (href === "/inbox" || href.startsWith("/inbox")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/approval" || href.startsWith("/approval")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.replyDrafts(),
      queryFn: () => replyDraftsQuery(),
      staleTime: STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/report" || href.startsWith("/report")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.dailyReport(),
      queryFn: dailyReportQuery,
      staleTime: REPORT_STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/logs" || href.startsWith("/logs")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.workflowLogs(""),
      queryFn: () => workflowLogsWithMetaQuery(),
      staleTime: STALE,
    });
  }
}
