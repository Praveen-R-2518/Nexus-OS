/**
 * Shared chart-block contract for the Revenue Analyst chat visuals feature.
 *
 * The model emits fenced code blocks tagged `nexuschart` containing ONLY JSON
 * matching {@link NexusChartSpec}; the chat UI parses assistant content with
 * {@link parseAssistantContent} and renders chart segments with ChartBlock.
 * This module is imported by BOTH the server (system prompt) and the client
 * (parser/renderer), so it must stay dependency-free and never import
 * "server-only".
 */

export const CHART_FENCE_TAG = "nexuschart";

export type NexusChartPoint = { label: string; value: number };
export type NexusChartSeries = { name: string; data: NexusChartPoint[] };

export type NexusChartSpec =
  | {
      type: "bar" | "line" | "donut";
      title?: string;
      series: NexusChartSeries[];
    }
  | {
      type: "table";
      title?: string;
      columns: string[];
      rows: Array<Array<string | number>>;
    };

export type AssistantSegment =
  | { kind: "text"; text: string }
  | { kind: "chart"; spec: NexusChartSpec }
  /** A ```nexuschart fence that is still streaming (no closing fence yet). */
  | { kind: "chart-pending" }
  /** A completed ```nexuschart fence whose JSON was invalid — shown as code. */
  | { kind: "chart-invalid"; raw: string };

const MAX_POINTS = 24;
const MAX_SERIES = 4;
const MAX_TABLE_ROWS = 30;

function isPoint(v: unknown): v is NexusChartPoint {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as NexusChartPoint).label === "string" &&
    typeof (v as NexusChartPoint).value === "number" &&
    Number.isFinite((v as NexusChartPoint).value)
  );
}

/** Validate + clamp a parsed JSON value into a renderable chart spec, or null. */
export function validateChartSpec(value: unknown): NexusChartSpec | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;

  if (v.type === "table") {
    if (!Array.isArray(v.columns) || !Array.isArray(v.rows)) return null;
    const columns = v.columns.filter((c): c is string => typeof c === "string");
    if (columns.length === 0) return null;
    const rows = v.rows
      .filter((r): r is Array<string | number> =>
        Array.isArray(r) &&
        r.every((c) => typeof c === "string" || typeof c === "number"),
      )
      .slice(0, MAX_TABLE_ROWS);
    return {
      type: "table",
      title: typeof v.title === "string" ? v.title : undefined,
      columns,
      rows,
    };
  }

  if (v.type === "bar" || v.type === "line" || v.type === "donut") {
    if (!Array.isArray(v.series)) return null;
    const series: NexusChartSeries[] = [];
    for (const s of v.series.slice(0, MAX_SERIES)) {
      if (!s || typeof s !== "object") continue;
      const cand = s as Record<string, unknown>;
      if (!Array.isArray(cand.data)) continue;
      const data = cand.data.filter(isPoint).slice(0, MAX_POINTS);
      if (data.length === 0) continue;
      series.push({
        name: typeof cand.name === "string" ? cand.name : "",
        data,
      });
    }
    if (series.length === 0) return null;
    // Donuts only make sense with a single series.
    if (v.type === "donut" && series.length > 1) series.length = 1;
    return {
      type: v.type,
      title: typeof v.title === "string" ? v.title : undefined,
      series,
    };
  }

  return null;
}

const FENCE_OPEN = "```" + CHART_FENCE_TAG;

/**
 * Split streamed assistant content into text and chart segments. Streaming-safe:
 * an opened but unterminated ```nexuschart fence becomes a `chart-pending`
 * segment (the UI shows a placeholder until the closing fence arrives).
 */
export function parseAssistantContent(content: string): AssistantSegment[] {
  const segments: AssistantSegment[] = [];
  let rest = content;

  while (rest.length > 0) {
    const openAt = rest.indexOf(FENCE_OPEN);
    if (openAt === -1) {
      if (rest.trim()) segments.push({ kind: "text", text: rest });
      break;
    }
    const before = rest.slice(0, openAt);
    if (before.trim()) segments.push({ kind: "text", text: before });

    const afterOpen = rest.slice(openAt + FENCE_OPEN.length);
    const closeAt = afterOpen.indexOf("```");
    if (closeAt === -1) {
      segments.push({ kind: "chart-pending" });
      break;
    }
    const raw = afterOpen.slice(0, closeAt).trim();
    try {
      const spec = validateChartSpec(JSON.parse(raw));
      if (spec) segments.push({ kind: "chart", spec });
      else segments.push({ kind: "chart-invalid", raw });
    } catch {
      segments.push({ kind: "chart-invalid", raw });
    }
    rest = afterOpen.slice(closeAt + 3);
  }

  return segments;
}

/** System-prompt addendum appended only when the workspace has visuals enabled. */
export function chartPromptAddendum(): string {
  return [
    "VISUALS:",
    `- When a chart communicates the answer better than prose (trends, comparisons, breakdowns), you MAY include ONE chart by emitting a fenced code block tagged ${CHART_FENCE_TAG} containing ONLY valid JSON, no comments.`,
    '- Chart JSON shape: { "type": "bar" | "line" | "donut", "title": string, "series": [ { "name": string, "data": [ { "label": string, "value": number } ] } ] }',
    '- Table JSON shape: { "type": "table", "title": string, "columns": [string], "rows": [[string | number]] }',
    "- Use ONLY numbers that appear in the DATA SNAPSHOT or KNOWLEDGE BASE — never invent or extrapolate values for a chart.",
    "- Keep charts small (≤ 12 points), put the chart after the relevant sentence, and always state the key takeaway in text too.",
    "- If no visual is warranted, do not emit one.",
  ].join("\n");
}
