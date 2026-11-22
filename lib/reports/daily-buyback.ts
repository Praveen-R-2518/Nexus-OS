import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeReport } from "@/lib/ai/report-summary";

const REPORT_TZ = "Asia/Colombo";

export type DailyReportRunResult = {
  tenants: number;
  saved: number;
  failed: number;
};

function reportDateInColombo(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function startOfReportDayIso(reportDate: string): string {
  return `${reportDate}T00:00:00+05:30`;
}

type Tenant = { team_id: string; workspace_id: string | null; name: string | null };

/**
 * Build and persist today's Buy-Back report for every tenant (or one team when teamId is set).
 * n8n must not query conversations/leads/followups via Supabase REST.
 */
export async function runDailyBuyBackReports(
  supabase: SupabaseClient,
  opts?: { teamId?: string | null },
): Promise<DailyReportRunResult> {
  const reportDate = reportDateInColombo();
  const sinceIso = startOfReportDayIso(reportDate);

  let tenantQuery = supabase
    .from("business_profiles")
    .select("team_id, workspace_id, name")
    .not("team_id", "is", null);
  if (opts?.teamId) {
    tenantQuery = tenantQuery.eq("team_id", opts.teamId);
  }
  const { data: profiles, error: profileErr } = await tenantQuery;
  if (profileErr) throw new Error(profileErr.message);

  const seen = new Set<string>();
  const tenants: Tenant[] = [];
  for (const row of profiles ?? []) {
    const teamId = typeof row.team_id === "string" ? row.team_id : null;
    if (!teamId || seen.has(teamId)) continue;
    seen.add(teamId);
    tenants.push({
      team_id: teamId,
      workspace_id: typeof row.workspace_id === "string" ? row.workspace_id : null,
      name: typeof row.name === "string" ? row.name : null,
    });
  }

  let saved = 0;
  let failed = 0;

  for (const tenant of tenants) {
    try {
      const { count: totalConversations, error: convErr } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("team_id", tenant.team_id)
        .gte("received_at", sinceIso);
      if (convErr) throw new Error(convErr.message);

      const { count: hotLeadsCount, error: hotErr } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("team_id", tenant.team_id)
        .eq("urgency", "high")
        .in("status", ["new", "in_progress", "awaiting_reply"]);
      if (hotErr) throw new Error(hotErr.message);

      const { count: churnRisksCount, error: churnErr } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("team_id", tenant.team_id)
        .eq("risk_type", "churn_risk");
      if (churnErr) throw new Error(churnErr.message);

      const { count: repliesDrafted, error: draftErr } = await supabase
        .from("reply_drafts")
        .select("id", { count: "exact", head: true })
        .eq("team_id", tenant.team_id)
        .gte("created_at", sinceIso);
      if (draftErr) throw new Error(draftErr.message);

      const { count: followupsScheduled, error: fuErr } = await supabase
        .from("followups")
        .select("id", { count: "exact", head: true })
        .eq("team_id", tenant.team_id)
        .eq("status", "pending");
      if (fuErr) throw new Error(fuErr.message);

      const { data: revenueRows, error: revErr } = await supabase
        .from("leads")
        .select("estimated_value")
        .eq("team_id", tenant.team_id)
        .neq("status", "replied");
      if (revErr) throw new Error(revErr.message);

      const revenueAtRisk = Math.round(
        (revenueRows ?? []).reduce((sum, item) => {
          const n = Number((item as { estimated_value?: unknown }).estimated_value);
          return sum + (Number.isFinite(n) ? n : 0);
        }, 0),
      );
      const drafted = repliesDrafted ?? 0;
      const followups = followupsScheduled ?? 0;
      const hoursSaved = Math.round((((drafted * 12) + (followups * 8)) / 60) * 10) / 10;
      const stats = {
        business_name: tenant.name ?? "the business",
        date: reportDate,
        total_conversations: totalConversations ?? 0,
        hot_leads_count: hotLeadsCount ?? 0,
        churn_risks_count: churnRisksCount ?? 0,
        replies_drafted: drafted,
        followups_scheduled: followups,
        revenue_at_risk: revenueAtRisk,
        hours_saved: hoursSaved,
      };

      const { summary } = await summarizeReport({
        stats,
        style: "brief",
        teamId: tenant.team_id,
        workspaceId: tenant.workspace_id,
        supabase,
      });

      const { error: upsertErr } = await supabase.from("daily_reports").upsert(
        {
          team_id: tenant.team_id,
          workspace_id: tenant.workspace_id,
          report_date: reportDate,
          revenue_at_risk: revenueAtRisk,
          hot_leads_count: stats.hot_leads_count,
          churn_risks_count: stats.churn_risks_count,
          replies_drafted: drafted,
          followups_scheduled: followups,
          hours_saved: hoursSaved,
          messages_processed: stats.total_conversations,
          summary,
          summary_text: summary,
        },
        { onConflict: "team_id,report_date" },
      );
      if (upsertErr) throw new Error(upsertErr.message);

      await supabase.from("workflow_logs").insert({
        team_id: tenant.team_id,
        workspace_id: tenant.workspace_id,
        workflow_name: "daily_report",
        step: "report_saved",
        result: "success",
        payload: {
          date: reportDate,
          revenue_at_risk: revenueAtRisk,
          hours_saved: hoursSaved,
        },
        timestamp: new Date().toISOString(),
      });
      saved += 1;
    } catch (err) {
      failed += 1;
      await supabase.from("workflow_logs").insert({
        team_id: tenant.team_id,
        workspace_id: tenant.workspace_id,
        workflow_name: "daily_report",
        step: "report_failed",
        result: "error",
        payload: { date: reportDate },
        error: err instanceof Error ? err.message.slice(0, 2000) : "report failed",
        timestamp: new Date().toISOString(),
      });
    }
  }

  return { tenants: tenants.length, saved, failed };
}
