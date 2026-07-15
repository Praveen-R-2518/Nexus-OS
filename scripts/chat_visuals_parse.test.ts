/**
 * Unit tests for the chat visuals segment parser + spec validator
 * (lib/chat/visuals.ts). Run: npm run test:chat-visuals
 *
 * The parser must be streaming-safe (unterminated fences become a pending
 * segment, never a crash or leaked raw JSON) and the validator must reject
 * malformed specs so the renderer only ever sees clean data.
 */

import {
  parseAssistantContent,
  validateChartSpec,
  type AssistantSegment,
} from "@/lib/chat/visuals";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const CHART_JSON = JSON.stringify({
  type: "bar",
  title: "Revenue at risk by urgency",
  series: [
    {
      name: "At risk",
      data: [
        { label: "critical", value: 1200 },
        { label: "high", value: 800 },
      ],
    },
  ],
});

check("plain text → single text segment", () => {
  const segs = parseAssistantContent("You have 3 hot leads worth $4,200.");
  assert(segs.length === 1 && segs[0].kind === "text", "one text segment");
});

check("text + complete chart + text → three segments in order", () => {
  const segs = parseAssistantContent(
    `Here's the breakdown:\n\`\`\`nexuschart\n${CHART_JSON}\n\`\`\`\nCritical leads dominate.`,
  );
  const kinds = segs.map((s: AssistantSegment) => s.kind);
  assert(
    JSON.stringify(kinds) === JSON.stringify(["text", "chart", "text"]),
    `expected text,chart,text got ${kinds.join(",")}`,
  );
  const chart = segs[1];
  assert(
    chart.kind === "chart" && chart.spec.type === "bar" && chart.spec.series[0].data.length === 2,
    "chart spec parsed",
  );
});

check("unterminated fence → chart-pending (streaming safety)", () => {
  const segs = parseAssistantContent(
    `Building your view:\n\`\`\`nexuschart\n{"type":"bar","series":[{"na`,
  );
  assert(segs[0].kind === "text", "leading text kept");
  assert(segs[1].kind === "chart-pending", "open fence is pending");
  assert(segs.length === 2, "nothing after pending");
});

check("invalid JSON in a closed fence → chart-invalid with raw", () => {
  const segs = parseAssistantContent("```nexuschart\n{not json}\n```");
  assert(segs[0].kind === "chart-invalid", "invalid segment");
  assert(segs[0].kind === "chart-invalid" && segs[0].raw.includes("not json"), "raw preserved");
});

check("valid JSON but wrong shape → chart-invalid", () => {
  const segs = parseAssistantContent('```nexuschart\n{"type":"pie","slices":[]}\n```');
  assert(segs[0].kind === "chart-invalid", "unknown type rejected");
});

check("ordinary ``` code fences are left as text", () => {
  const segs = parseAssistantContent("Use this:\n```sql\nselect 1;\n```\ndone");
  assert(segs.every((s) => s.kind === "text"), "non-nexuschart fences untouched");
});

check("validator clamps oversize inputs and drops bad points", () => {
  const spec = validateChartSpec({
    type: "line",
    series: [
      {
        name: "big",
        data: [
          ...Array.from({ length: 100 }, (_, i) => ({ label: `d${i}`, value: i })),
          { label: "bad", value: "NaN" },
        ],
      },
    ],
  });
  assert(spec !== null && spec.type === "line", "accepted");
  assert(spec !== null && spec.type === "line" && spec.series[0].data.length === 24, "clamped to 24 points");
});

check("table spec validates columns/rows", () => {
  const good = validateChartSpec({
    type: "table",
    columns: ["Customer", "Value"],
    rows: [["Acme", 1200], ["Beta", 300]],
  });
  assert(good !== null && good.type === "table" && good.rows.length === 2, "good table passes");
  const bad = validateChartSpec({ type: "table", columns: [], rows: [] });
  assert(bad === null, "empty columns rejected");
});

check("donut keeps only the first series", () => {
  const spec = validateChartSpec({
    type: "donut",
    series: [
      { name: "a", data: [{ label: "x", value: 1 }] },
      { name: "b", data: [{ label: "y", value: 2 }] },
    ],
  });
  assert(spec !== null && spec.type === "donut" && spec.series.length === 1, "single series");
});

console.log(`\nchat_visuals_parse: ${passed}/9 checks passed`);
