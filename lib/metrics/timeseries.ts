export const METRICS_TIMESERIES_RANGES = [
  "week",
  "month",
  "6m",
  "year",
  "all",
] as const;

export type MetricsTimeseriesRange = (typeof METRICS_TIMESERIES_RANGES)[number];

export type MetricsTimeseriesPoint = {
  date: string;
  revenue_at_risk: number;
  hot_leads: number;
  churn_risks: number;
};

export type ConversationTimeseriesRow = {
  created_at: string;
  estimated_value: number | null;
  intent: string | null;
  urgency: string | null;
  status: string | null;
};

const TERMINAL_STATUSES = new Set(["approved", "sent", "rejected"]);
const MAX_DAILY_POINTS = 90;

export function isMetricsTimeseriesRange(value: string): value is MetricsTimeseriesRange {
  return (METRICS_TIMESERIES_RANGES as readonly string[]).includes(value);
}

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive UTC day range start for the selected preset. */
export function rangeStartDate(
  range: MetricsTimeseriesRange,
  now = new Date(),
): Date {
  const end = utcDayStart(now);
  const start = new Date(end);
  switch (range) {
    case "week":
      start.setUTCDate(start.getUTCDate() - 6);
      break;
    case "month":
      start.setUTCDate(start.getUTCDate() - 29);
      break;
    case "6m":
      start.setUTCDate(start.getUTCDate() - 179);
      break;
    case "year":
      start.setUTCDate(start.getUTCDate() - 364);
      break;
    case "all":
      start.setUTCFullYear(start.getUTCFullYear() - 2);
      break;
    default:
      start.setUTCDate(start.getUTCDate() - 29);
  }
  return start;
}

function emptyBucket(): Omit<MetricsTimeseriesPoint, "date"> {
  return { revenue_at_risk: 0, hot_leads: 0, churn_risks: 0 };
}

function isHotLead(row: ConversationTimeseriesRow): boolean {
  return (
    row.intent === "purchase" &&
    (row.urgency === "critical" || row.urgency === "high")
  );
}

function isChurnRisk(row: ConversationTimeseriesRow): boolean {
  return row.intent === "churn_risk";
}

function contributesRevenueAtRisk(row: ConversationTimeseriesRow): boolean {
  const status = (row.status ?? "").trim();
  return status.length > 0 && !TERMINAL_STATUSES.has(status);
}

/** Bucket conversations by UTC day; fill missing days with zeros. */
export function buildDailyTimeseries(
  rows: ConversationTimeseriesRow[],
  range: MetricsTimeseriesRange,
  now = new Date(),
): MetricsTimeseriesPoint[] {
  const start = rangeStartDate(range, now);
  const end = utcDayStart(now);
  const buckets = new Map<string, Omit<MetricsTimeseriesPoint, "date">>();

  for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    buckets.set(utcDateKey(cur), emptyBucket());
  }

  for (const row of rows) {
    const created = new Date(row.created_at);
    if (Number.isNaN(created.getTime())) continue;
    const key = utcDateKey(utcDayStart(created));
    const bucket = buckets.get(key);
    if (!bucket) continue;

    if (contributesRevenueAtRisk(row)) {
      bucket.revenue_at_risk += Number(row.estimated_value) || 0;
    }
    if (isHotLead(row)) bucket.hot_leads += 1;
    if (isChurnRisk(row)) bucket.churn_risks += 1;
  }

  const daily = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, ...values }));

  if (daily.length <= MAX_DAILY_POINTS) return daily;
  return downsampleWeekly(daily);
}

/** Sum daily points into ISO-week buckets (Monday start, UTC). */
export function downsampleWeekly(
  points: MetricsTimeseriesPoint[],
): MetricsTimeseriesPoint[] {
  if (points.length === 0) return [];

  const weekKey = (dateStr: string): string => {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return utcDateKey(d);
  };

  const grouped = new Map<string, MetricsTimeseriesPoint>();
  for (const point of points) {
    const key = weekKey(point.date);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...point, date: key });
      continue;
    }
    existing.revenue_at_risk += point.revenue_at_risk;
    existing.hot_leads += point.hot_leads;
    existing.churn_risks += point.churn_risks;
  }

  return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
}
