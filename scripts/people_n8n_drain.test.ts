/**
 * Wave 2 K1 — WF9 People Match Drain export contract.
 * Run: npx tsx scripts/people_n8n_drain.test.ts  (or `npm run test:people-n8n-drain`)
 *
 * n8n may only POST the existing People job-run endpoint. Scoring, OpenAI, and
 * Supabase REST stay in Nexus.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

type ExportNode = {
  name: string;
  type: string;
  parameters?: Record<string, unknown>;
};

type ExportJson = {
  name: string;
  nodes: ExportNode[];
  connections: Record<string, { main: Array<Array<{ node: string }>> }>;
};

const exportPath = join(process.cwd(), "n8n_logic", "exports", "wf9_people_match_drain.json");
const wf = JSON.parse(readFileSync(exportPath, "utf8")) as ExportJson;
const serialized = JSON.stringify(wf);

check("export is named WF9 People Match Drain", () => {
  assert(wf.name === "WF9 People Match Drain", `name was ${wf.name}`);
});

check("only schedule, HTTP, and sticky nodes", () => {
  const types = wf.nodes.map((n) => n.type).sort();
  assert(types.length === 3, `expected 3 nodes, got ${types.length}`);
  assert(types.includes("n8n-nodes-base.scheduleTrigger"), "missing scheduleTrigger");
  assert(types.includes("n8n-nodes-base.httpRequest"), "missing httpRequest");
  assert(types.includes("n8n-nodes-base.stickyNote"), "missing stickyNote");
  const extra = types.filter(
    (t) =>
      t !== "n8n-nodes-base.scheduleTrigger" &&
      t !== "n8n-nodes-base.httpRequest" &&
      t !== "n8n-nodes-base.stickyNote",
  );
  assert(extra.length === 0, `unexpected node types: ${extra.join(", ")}`);
});

const schedule = wf.nodes.find((n) => n.type === "n8n-nodes-base.scheduleTrigger");
const http = wf.nodes.find((n) => n.type === "n8n-nodes-base.httpRequest");
assert(schedule, "missing schedule node");
assert(http, "missing HTTP node");

check("schedule fires every 15 minutes", () => {
  const rule = schedule!.parameters?.rule as { interval?: Array<{ field?: string; minutesInterval?: number }> };
  const interval = rule?.interval?.[0];
  assert(interval?.field === "minutes", `field was ${interval?.field}`);
  assert(interval?.minutesInterval === 15, `minutesInterval was ${interval?.minutesInterval}`);
});

check("HTTP POSTs /api/internal/people/jobs/run with bootstrap $vars", () => {
  const params = http!.parameters ?? {};
  assert(params.method === "POST", `method was ${params.method}`);
  const url = String(params.url ?? "");
  assert(url.includes("/api/internal/people/jobs/run"), `url was ${url}`);
  assert(url.includes("$vars.NEXUS_APP_URL"), "url must use $vars.NEXUS_APP_URL");
  assert(url.includes("nexusos.knurdz.org"), "url must fall back to production app host");

  const headers = params.headerParameters as { parameters?: Array<{ name?: string; value?: string }> };
  const auth = headers?.parameters?.find((h) => h.name === "Authorization");
  assert(auth, "missing Authorization header");
  const authValue = String(auth?.value ?? "");
  assert(authValue.includes("$vars.N8N_BOOTSTRAP_TOKEN"), "must send bootstrap token");
  assert(authValue.includes("$vars.N8N_INGEST_TOKEN"), "must fall back to ingest token");
  assert(!/\$env\./.test(authValue), "n8n Cloud blocks $env in node expressions");

  const body = String(params.jsonBody ?? "");
  assert(body.includes("limit") && body.includes("5"), `jsonBody was ${body}`);

  const options = params.options as { timeout?: number; response?: { response?: { neverError?: boolean } } };
  assert(options?.timeout === 300000, `timeout was ${options?.timeout}`);
  assert(options?.response?.response?.neverError === true, "neverError must be true");
});

check("schedule connects only to Drain People Match Jobs", () => {
  const next = wf.connections["Schedule Trigger"]?.main?.[0]?.[0]?.node;
  assert(next === "Drain People Match Jobs", `connected to ${next}`);
  assert(http!.name === "Drain People Match Jobs", `HTTP node name was ${http!.name}`);
});

check("n8n does not score, call OpenAI, or use Supabase REST", () => {
  const lowered = serialized.toLowerCase();
  assert(!lowered.includes("api.openai.com"), "must not call OpenAI");
  assert(!lowered.includes("supabase.co"), "must not call Supabase REST");
  assert(!/service_role/.test(serialized), "must not embed a service_role secret");
  assert(!/scorecandidate|handlepeoplematch|technical_fit/.test(lowered), "must not embed scoring");
  assert(
    !wf.nodes.some((n) => /openai|supabase/i.test(n.type)),
    "no OpenAI/Supabase nodes",
  );
});

console.log(`\n${passed} checks passed.`);
