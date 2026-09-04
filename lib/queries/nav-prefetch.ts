import type { QueryClient } from "@tanstack/react-query";
import type { TenantScopeValue } from "@/components/tenant/TenantScope";
import {
  conversationsQuery,
  dailyReportQuery,
  EMPLOYEES_PAGE_SIZE,
  CANDIDATES_PAGE_SIZE,
  candidatesQuery,
  employeesQuery,
  JOBS_PAGE_SIZE,
  jobsQuery,
  metricsQuery,
  PEOPLE_EMAIL_PICKER_LIMIT,
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

  if (href === "/people/email" || href.startsWith("/people/email")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.employees(
        teamId,
        "",
        "",
        false,
        PEOPLE_EMAIL_PICKER_LIMIT,
        0,
      ),
      queryFn: () =>
        employeesQuery({ limit: PEOPLE_EMAIL_PICKER_LIMIT, offset: 0 }),
      staleTime: STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.candidates(
        teamId,
        "",
        "",
        false,
        PEOPLE_EMAIL_PICKER_LIMIT,
        0,
      ),
      queryFn: () =>
        candidatesQuery({ limit: PEOPLE_EMAIL_PICKER_LIMIT, offset: 0 }),
      staleTime: STALE,
    });
    void queryClient.prefetchQuery({
      queryKey: queryKeys.settings(teamId),
      queryFn: settingsQuery,
      staleTime: STALE,
    });
    return;
  }

  if (href === "/people/jobs" || href.startsWith("/people/jobs")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.jobs(teamId, "", "", false, JOBS_PAGE_SIZE, 0),
      queryFn: () => jobsQuery({ limit: JOBS_PAGE_SIZE, offset: 0 }),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/people/candidates" || href.startsWith("/people/candidates")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.candidates(
        teamId,
        "",
        "",
        false,
        CANDIDATES_PAGE_SIZE,
        0,
      ),
      queryFn: () =>
        candidatesQuery({ limit: CANDIDATES_PAGE_SIZE, offset: 0 }),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/people" || href.startsWith("/people")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.employees(
        teamId,
        "",
        "",
        false,
        EMPLOYEES_PAGE_SIZE,
        0,
      ),
      queryFn: () =>
        employeesQuery({ limit: EMPLOYEES_PAGE_SIZE, offset: 0 }),
      staleTime: STALE,
    });
    return;
  }

  if (href === "/profile" || href.startsWith("/profile") || href === "/settings" || href.startsWith("/settings")) {
    void queryClient.prefetchQuery({
      queryKey: queryKeys.settings(teamId),
      queryFn: settingsQuery,
      staleTime: STALE,
    });
  }
}
