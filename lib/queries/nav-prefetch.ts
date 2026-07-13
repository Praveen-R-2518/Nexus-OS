import type { QueryClient } from "@tanstack/react-query";
import type { TenantScopeValue } from "@/components/tenant/TenantScope";
import {
  conversationsQuery,
  dailyReportQuery,
  metricsQuery,
  replyDraftsQuery,
  settingsQuery,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";

const STALE = 30_000;
const REPORT_STALE = 60_000;

export function prefetchNavRoute(
  queryClient: QueryClient,
  href: string,
  tenant: Pick<TenantScopeValue, "ready" | "teamId"> | null,
): void {
  if (!tenant?.ready || !tenant.teamId) {
    return;
  }
  const teamId = tenant.teamId;

  if (href === "/dashboard" || href.startsWith("/dashboard")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(teamId, 100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.metrics(teamId),
      queryFn: metricsQuery,
      staleTime: STALE,
    });
    return;
  }

  if (href === "/inbox" || href.startsWith("/inbox")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(teamId, 100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/approval" || href.startsWith("/approval")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.replyDrafts(teamId),
      queryFn: () => replyDraftsQuery(),
      staleTime: STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(teamId, 100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/report" || href.startsWith("/report")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.dailyReport(teamId),
      queryFn: dailyReportQuery,
      staleTime: REPORT_STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.conversations(teamId, 100),
      queryFn: () => conversationsQuery(100),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/settings" || href.startsWith("/settings")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.settings(teamId),
      queryFn: settingsQuery,
      staleTime: STALE,
    });
  }
}
