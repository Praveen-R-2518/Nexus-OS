/**
 * `/api/approval` PATCH tests (Task B.1) — drives the real handler with mocked
 * `@/lib/api-security` (tenant context) and `@/lib/supabase` (service-role client) modules.
 * Run: npx tsx scripts/approval_route.test.ts  (or `npm run test:approval`)
 *
 * Proves:
 *  1. Approving a draft upserts a `queued` row into `outbound_jobs` via the SERVICE-ROLE client
 *     (never the tenant-scoped route client — RLS revokes insert/update from `authenticated`).
 *  2. The PATCH response surfaces `status: "queued"` and the `outbound_job` row (Task B.4).
 *  3. Approving the same draft twice upserts (not duplicates) the same job row.
 *  4. Rejecting a draft still works and does not touch `outbound_jobs`.
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const CONV_ID = "33333333-3333-4333-8333-333333333333";
const DRAFT_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

const draftsTable: Row[] = [
  {
    id: DRAFT_ID,
    team_id: TEAM_ID,
    conversation_id: CONV_ID,
    draft_text: "Thanks for reaching out!",
    approval_status: "pending",
  },
];
const conversationsTable: Row[] = [
  { id: CONV_ID, team_id: TEAM_ID, workspace_id: WORKSPACE_ID, source: "gmail", status: "pending" },
];
const outboundJobsTable: Row[] = [];

/** Route-handler (tenant-scoped) client: only touches reply_drafts + conversations. */
function tenantSupabase() {
  return {
    from(table: string) {
      const rows = table === "reply_drafts" ? draftsTable : table === "conversations" ? conversationsTable : [];
      const filters: Array<[string, unknown]> = [];
      let updatePatch: Row | null = null;
      const chain: any = {
        select() {
          return chain;
        },
        update(patch: Row) {
          updatePatch = patch;
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return chain;
        },
        maybeSingle() {
          const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
        },
        single() {
          const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v));
          if (hit && updatePatch) Object.assign(hit, updatePatch);
          return Promise.resolve({ data: hit ? { ...hit } : null, error: null });
        },
        then(resolve: (v: { data: null; error: null }) => unknown) {
          // Bare `.update().eq().eq()` (conversations status update) with no terminal select.
          if (updatePatch) {
            const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v));
            if (hit) Object.assign(hit, updatePatch);
          }
          return resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  };
}

/** Service-role client used only for `outbound_jobs` (createServerClient()). */
function serviceSupabase() {
  return {
    from(table: string) {
      assert(table === "outbound_jobs", `service client should only touch outbound_jobs, got ${table}`);
      return {
        upsert(row: Row) {
          return {
            select(_cols: string) {
              return {
                maybeSingle() {
                  const existing = outboundJobsTable.find((r) => r.draft_id === row.draft_id);
                  if (existing) {
                    Object.assign(existing, row);
                    return Promise.resolve({ data: { ...existing }, error: null });
                  }
                  const id = `job-${outboundJobsTable.length + 1}`;
                  const now = new Date().toISOString();
                  const inserted = { id, attempts: 0, created_at: now, updated_at: now, ...row };
                  outboundJobsTable.push(inserted);
                  return Promise.resolve({ data: { ...inserted }, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/api-security") {
    return {
      JSON_LIMITS: { small: 16 * 1024, medium: 64 * 1024, ingest: 256 * 1024 },
      rateLimit: () => null,
      readJsonObjectWithLimit: async (req: Request) => ({ ok: true, body: await req.json() }),
      n8nWebhookAuthHeaders: () => ({}),
      requireApiTenantContext: async () => ({
        ok: true,
        user: { id: "user-1" },
        supabase: tenantSupabase(),
        teamId: TEAM_ID,
        workspaceId: WORKSPACE_ID,
      }),
    };
  }
  if (request === "@/lib/supabase") {
    return { createServerClient: () => serviceSupabase(), createBrowserClient: () => ({}) };
  }
  return origLoad.apply(this, args);
};

// No N8N_WEBHOOK_BASE_URL -> approvalWebhookUrl() returns null -> webhook POST is skipped, no
// network call needed for this test.
delete process.env.N8N_WEBHOOK_BASE_URL;

function patch(PATCH: (r: Request) => Promise<Response>, body: Record<string, unknown>) {
  return PATCH(
    new Request("https://example.com/api/approval", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

let passed = 0;
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

(async () => {
  const { PATCH } = await import("@/app/api/approval/route");

  await check("approve queues an outbound_jobs row and returns it", async () => {
    const res = await patch(PATCH, { draft_id: DRAFT_ID, action: "approve" });
    const json = (await res.json()) as {
      success: boolean;
      status: string;
      outbound_job: Row | null;
      draft: Row;
    };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.success === true, "success true");
    assert(json.status === "queued", `top-level status should be queued, got ${json.status}`);
    assert(json.draft.approval_status === "approved", "draft approved");
    assert(json.outbound_job !== null, "outbound_job present in response");
    assert(json.outbound_job!.status === "queued", "outbound_job.status queued");
    assert(json.outbound_job!.draft_id === DRAFT_ID, "outbound_job.draft_id matches");
    assert(json.outbound_job!.team_id === TEAM_ID, "outbound_job.team_id matches");
    assert(json.outbound_job!.workspace_id === WORKSPACE_ID, "outbound_job.workspace_id matches");
    assert(json.outbound_job!.conversation_id === CONV_ID, "outbound_job.conversation_id matches");
    assert(json.outbound_job!.channel === "gmail", "outbound_job.channel from conversation.source");
    assert(outboundJobsTable.length === 1, "exactly one outbound_jobs row created");
  });

  await check("approving the same draft again upserts (no duplicate row)", async () => {
    draftsTable[0].approval_status = "pending"; // reset for re-approve
    const res = await patch(PATCH, { draft_id: DRAFT_ID, action: "approve" });
    assert(res.status === 200, `status ${res.status}`);
    assert(outboundJobsTable.length === 1, "still exactly one outbound_jobs row (upsert, not insert)");
  });

  await check("reject does not touch outbound_jobs", async () => {
    const before = outboundJobsTable.length;
    const res = await patch(PATCH, {
      draft_id: DRAFT_ID,
      action: "reject",
      rejection_reason: "not relevant",
    });
    const json = (await res.json()) as { success: boolean; draft: Row };
    assert(res.status === 200, `status ${res.status}`);
    assert(json.draft.approval_status === "rejected", "draft rejected");
    assert(outboundJobsTable.length === before, "outbound_jobs untouched on reject");
  });

  console.log(`\napproval-route: ${passed} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
