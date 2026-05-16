"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn, formatCurrency } from "@/lib/utils";
import type { Conversation, DailyReport } from "@/types";

type ReportResponse = {
  report: DailyReport | null;
  generated_at?: string;
  error?: string;
};

type ConversationsResponse = {
  data?: Conversation[];
  error?: string;
};

type SortKey =
  | "customer_name"
  | "intent"
  | "urgency"
  | "estimated_value"
  | "status"
  | "action";

type SortDirection = "asc" | "desc";

type TableRow = Conversation & {
  action: string;
};

const urgencyRank: Record<NonNullable<Conversation["urgency"]>, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function formatReportDate(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Report date unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function labelize(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isSameReportDay(conversationDate: string, reportDate: string): boolean {
  const conversation = new Date(conversationDate);
  const report = new Date(reportDate);
  if (Number.isNaN(conversation.getTime()) || Number.isNaN(report.getTime())) {
    return false;
  }

  return conversation.toDateString() === report.toDateString();
}

function actionTaken(status: Conversation["status"]): string {
  switch (status) {
    case "approved":
      return "Reply approved";
    case "sent":
      return "Reply sent";
    case "rejected":
      return "Draft rejected";
    case "draft_ready":
      return "Draft awaiting approval";
    case "classified":
      return "AI classified";
    case "new":
      return "Queued for triage";
    default:
      return "Pending review";
  }
}

function rowTone(status: Conversation["status"]): string {
  if (status === "approved" || status === "sent") {
    return "border-emerald-500/10 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.09]";
  }
  if (status === "rejected") {
    return "border-red-500/10 bg-red-500/[0.06] hover:bg-red-500/[0.09]";
  }
  return "border-yellow-500/10 bg-yellow-500/[0.05] hover:bg-yellow-500/[0.08]";
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (!/[",\n\r]/.test(str)) {
    return str;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function TypewriterSummary({ text }: { text: string }) {
  const [visibleText, setVisibleText] = useState("");

  useEffect(() => {
    setVisibleText("");
    if (!text) return;

    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setVisibleText(text.slice(0, index));
      if (index >= text.length) {
        window.clearInterval(timer);
      }
    }, 14);

    return () => window.clearInterval(timer);
  }, [text]);

  return (
    <p className="whitespace-pre-line text-base leading-8 text-gray-200">
      {visibleText}
      {visibleText.length < text.length ? (
        <span className="ml-0.5 animate-pulse text-emerald-300">|</span>
      ) : null}
    </p>
  );
}

export default function ReportPage() {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("estimated_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError(null);

      try {
        const [reportRes, conversationsRes] = await Promise.all([
          fetch("/api/report"),
          fetch("/api/conversations?limit=100"),
        ]);

        const reportJson = (await reportRes.json()) as ReportResponse;
        const conversationsJson =
          (await conversationsRes.json()) as ConversationsResponse;

        if (!reportRes.ok) {
          throw new Error(reportJson.error ?? reportRes.statusText);
        }
        if (!conversationsRes.ok) {
          throw new Error(conversationsJson.error ?? conversationsRes.statusText);
        }
        if (!Array.isArray(conversationsJson.data)) {
          throw new Error("Invalid conversations response");
        }

        if (!cancelled) {
          setReport(reportJson.report ?? null);
          setConversations(conversationsJson.data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load report");
          setReport(null);
          setConversations([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, []);

  const todaysRows = useMemo<TableRow[]>(() => {
    const reportDate = report?.report_date;
    const rows = reportDate
      ? conversations.filter((c) => isSameReportDay(c.created_at, reportDate))
      : [];

    return rows.map((c) => ({
      ...c,
      action: actionTaken(c.status),
    }));
  }, [conversations, report]);

  const revenueRecovered = useMemo(() => {
    return todaysRows
      .filter((row) => row.status === "approved")
      .reduce((sum, row) => sum + (Number(row.estimated_value) || 0), 0);
  }, [todaysRows]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...todaysRows].sort((a, b) => {
      let aValue: string | number;
      let bValue: string | number;

      if (sortKey === "estimated_value") {
        aValue = Number(a.estimated_value) || 0;
        bValue = Number(b.estimated_value) || 0;
      } else if (sortKey === "urgency") {
        aValue = a.urgency ? urgencyRank[a.urgency] : 0;
        bValue = b.urgency ? urgencyRank[b.urgency] : 0;
      } else {
        aValue = String(a[sortKey]).toLowerCase();
        bValue = String(b[sortKey]).toLowerCase();
      }

      if (aValue < bValue) return -1 * direction;
      if (aValue > bValue) return 1 * direction;
      return a.created_at.localeCompare(b.created_at) * -1;
    });
  }, [sortDirection, sortKey, todaysRows]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) =>
          currentDirection === "asc" ? "desc" : "asc",
        );
        return currentKey;
      }

      setSortDirection(key === "estimated_value" ? "desc" : "asc");
      return key;
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    const headers = [
      "Customer",
      "Intent",
      "Urgency",
      "Value",
      "Status",
      "Action Taken",
    ];
    const rows = sortedRows.map((row) => [
      row.customer_name,
      labelize(row.intent),
      labelize(row.urgency),
      row.estimated_value,
      labelize(row.status),
      row.action,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `daily-buy-back-report-${report?.report_date ?? "latest"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [report?.report_date, sortedRows]);

  const reportDateLabel = formatReportDate(report?.report_date);

  return (
    <div className="relative min-h-[calc(100vh-6rem)] overflow-hidden">
      <div className="relative space-y-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-trajectory-blue">
              Revenue Recovery Intelligence
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-atmospheric-grey sm:text-4xl">
              Daily Buy-Back Report
            </h1>
            <p className="mt-3 text-sm text-atmospheric-grey/60">{reportDateLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-trajectory-blue/30 bg-trajectory-blue/10 px-3 py-1.5 text-sm font-medium text-trajectory-blue">
              <Sparkles className="h-4 w-4" />
              Generated by AI
            </span>
            {report?.created_at ? (
              <span className="text-xs text-atmospheric-grey/40">
                Generated {new Date(report.created_at).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[132px] animate-pulse rounded-xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        ) : !report ? (
          <div className="rounded-2xl border border-white/10 glass-panel p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-atmospheric-grey">
                  No report generated yet today.
                </h2>
                <p className="mt-1 text-sm text-atmospheric-grey/60">
                  Reports are generated daily at 9 AM.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <section
              aria-label="Report KPI summary"
              className="grid gap-4 sm:grid-cols-3"
            >
              <Card
                title="Messages Processed"
                value={report.messages_processed}
                subtitle="customer conversations analyzed"
                accent="text-blue-300"
                icon={<MessageSquareText className="text-blue-300" />}
                className="glass-panel"
              />
              <Card
                title="Revenue Recovered"
                value={formatCurrency(revenueRecovered)}
                subtitle="approved conversations value"
                accent="text-trajectory-blue"
                icon={<CheckCircle2 className="text-trajectory-blue" />}
                className="glass-panel"
              />
              <Card
                title="Drafts Approved"
                value={report.drafts_approved}
                subtitle="human-approved AI responses"
                accent="text-violet-300"
                icon={<FileText className="text-violet-300" />}
                className="glass-panel"
              />
            </section>

            <section aria-labelledby="executive-summary" className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-trajectory-blue" />
                <h2
                  id="executive-summary"
                  className="text-xl font-semibold text-atmospheric-grey"
                >
                  Executive Summary
                </h2>
              </div>
              <div className="rounded-2xl border border-white/10 glass-panel p-6">
                <TypewriterSummary text={report.summary_text} />
              </div>
            </section>

            <section
              aria-labelledby="conversation-breakdown"
              className="overflow-hidden rounded-2xl border border-white/10 glass-panel"
            >
              <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2
                    id="conversation-breakdown"
                    className="text-lg font-semibold text-atmospheric-grey"
                  >
                    Today&apos;s Conversation Breakdown
                  </h2>
                  <p className="mt-1 text-sm text-atmospheric-grey/60">
                    {todaysRows.length} conversations included in this report.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={sortedRows.length === 0}
                  className="glass-button inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-trajectory-blue transition-colors hover:text-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/5">
                    <tr>
                      {[
                        ["customer_name", "Customer"],
                        ["intent", "Intent"],
                        ["urgency", "Urgency"],
                        ["estimated_value", "Value"],
                        ["status", "Status"],
                        ["action", "Action Taken"],
                      ].map(([key, label]) => (
                        <th key={key} scope="col" className="px-4 py-3 text-left">
                          <button
                            type="button"
                            onClick={() => handleSort(key as SortKey)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-atmospheric-grey/60 transition-colors hover:text-atmospheric-grey"
                          >
                            {label}
                            <ArrowUpDown
                              className={cn(
                                "h-3.5 w-3.5",
                                sortKey === key
                                  ? "text-trajectory-blue"
                                  : "text-atmospheric-grey/40",
                              )}
                            />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {sortedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-10 text-center text-sm text-atmospheric-grey/60"
                        >
                          No conversations found for this report day.
                        </td>
                      </tr>
                    ) : (
                      sortedRows.map((row) => (
                        <tr
                          key={row.id}
                          className={cn(
                            "border-l-2 transition-colors",
                            rowTone(row.status),
                          )}
                        >
                          <td className="whitespace-nowrap px-4 py-3">
                            <div>
                              <p className="font-medium text-atmospheric-grey">
                                {row.customer_name}
                              </p>
                              {row.customer_email ? (
                                <p className="text-xs text-atmospheric-grey/60">
                                  {row.customer_email}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge
                              variant="intent"
                              value={row.intent}
                              label={labelize(row.intent)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge
                              variant="urgency"
                              value={row.urgency}
                              label={labelize(row.urgency)}
                            />
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold tabular-nums text-trajectory-blue">
                            {formatCurrency(row.estimated_value)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <Badge
                              variant="status"
                              value={row.status}
                              label={labelize(row.status)}
                            />
                          </td>
                          <td className="min-w-[220px] px-4 py-3 text-sm text-atmospheric-grey/80">
                            {row.action}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
