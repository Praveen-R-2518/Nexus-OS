/**
 * Metrics timeseries bucketing tests.
 * Run: npx tsx scripts/metrics_timeseries.test.ts
 */

import {
  buildDailyTimeseries,
  downsampleWeekly,
  rangeStartDate,
  type ConversationTimeseriesRow,
} from "@/lib/metrics/timeseries";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const NOW = new Date("2026-07-15T12:00:00.000Z");

function row(
  date: string,
  overrides: Partial<ConversationTimeseriesRow> = {},
): ConversationTimeseriesRow {
  return {
    created_at: `${date}T10:00:00.000Z`,
    estimated_value: 0,
    intent: null,
    urgency: null,
    status: "new",
    ...overrides,
  };
}

// week range is 7 inclusive days
{
  const start = rangeStartDate("week", NOW);
  assert(start.toISOString().slice(0, 10) === "2026-07-09", "week start");
}

// revenue at risk only for non-terminal statuses
{
  const points = buildDailyTimeseries(
    [
      row("2026-07-14", { estimated_value: 100, status: "new" }),
      row("2026-07-14", { estimated_value: 50, status: "sent" }),
      row("2026-07-14", { intent: "purchase", urgency: "high" }),
      row("2026-07-14", { intent: "churn_risk" }),
    ],
    "week",
    NOW,
  );
  const hit = points.find((p) => p.date === "2026-07-14");
  assert(hit, "day exists");
  assert(hit!.revenue_at_risk === 100, "revenue excludes terminal");
  assert(hit!.hot_leads === 1, "hot lead counted");
  assert(hit!.churn_risks === 1, "churn counted");
}

// missing days are zero-filled
{
  const points = buildDailyTimeseries([], "week", NOW);
  assert(points.length === 7, "week has 7 daily points");
  assert(points.every((p) => p.hot_leads === 0), "zeros when empty");
}

// weekly downsample sums buckets
{
  const daily = Array.from({ length: 100 }, (_, i) => {
    const d = new Date("2026-01-01T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    return {
      date,
      revenue_at_risk: 1,
      hot_leads: 1,
      churn_risks: 0,
    };
  });
  const weekly = downsampleWeekly(daily);
  assert(weekly.length < daily.length, "downsample reduces points");
  const totalHot = weekly.reduce((sum, p) => sum + p.hot_leads, 0);
  assert(totalHot === 100, "weekly sums preserve totals");
}

console.log("metrics_timeseries.test.ts: all passed");
