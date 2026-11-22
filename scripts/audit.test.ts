/**
 * Wave 1 A1 — append-only audit log.
 * Run: npx tsx scripts/audit.test.ts  (or `npm run test:audit`)
 *
 * Proves, with no live DB:
 *  A. Migration creates public.audit_events with tenant columns, indexes, RLS,
 *     SELECT + INSERT (actor = auth.uid()), no UPDATE/DELETE, revoke update/delete.
 *  B. writeAuditEvent stamps team/actor from server context, ignores extra event fields,
 *     and fails closed when context or insert is missing/broken.
 */

import { readdirSync, readFileSync } from "node:fs";
import Module from "node:module";
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

const migrationsDir = join(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const latest = migrationFiles[migrationFiles.length - 1] ?? "";
const auditFile = migrationFiles.find((f) => f.endsWith("_audit_events.sql"));

assert(!!auditFile, "missing *_audit_events.sql migration");
assert(
  auditFile! > "20260718120000_generic_mailbox_credentials.sql",
  `${auditFile} must sort after 20260718120000`,
);
assert(latest >= auditFile!, "audit_events migration must be among sorted SQL files");

const sql = readFileSync(join(migrationsDir, auditFile!), "utf8");

check("creates public.audit_events", () => {
  assert(/create table if not exists public\.audit_events/i.test(sql), "create table");
});

check("tenant columns and no organization_id", () => {
  assert(/team_id uuid not null references public\.teams/i.test(sql), "team_id FK");
  assert(/workspace_id uuid references public\.workspaces/i.test(sql), "workspace_id FK");
  assert(/actor_user_id uuid references auth\.users/i.test(sql), "actor_user_id FK");
  assert(!/organization_id/i.test(sql), "must not use organization_id");
});

check("required audit columns", () => {
  assert(/\bdomain text not null/i.test(sql), "domain");
  assert(/\baction text not null/i.test(sql), "action");
  assert(/\bentity_type text not null/i.test(sql), "entity_type");
  assert(/\bentity_id uuid/i.test(sql), "entity_id");
  assert(/\bprev_state jsonb/i.test(sql), "prev_state");
  assert(/\bnext_state jsonb/i.test(sql), "next_state");
  assert(/metadata jsonb not null default/i.test(sql), "metadata default");
  assert(/created_at timestamptz not null default now\(\)/i.test(sql), "created_at");
});

check("indexes for list and entity lookup", () => {
  assert(
    /on public\.audit_events \(team_id, created_at desc\)/i.test(sql),
    "team_id, created_at desc",
  );
  assert(
    /on public\.audit_events \(team_id, entity_type, entity_id\)/i.test(sql),
    "team_id, entity_type, entity_id",
  );
});

check("RLS enabled with select + insert only", () => {
  assert(/alter table public\.audit_events enable row level security/i.test(sql), "enable RLS");
  assert(/for select to authenticated/i.test(sql), "SELECT policy");
  assert(/private\.current_team_id\(\)/i.test(sql), "tenant via current_team_id");
  assert(/for insert to authenticated/i.test(sql), "INSERT policy");
  assert(/actor_user_id = \(select auth\.uid\(\)\)/i.test(sql), "INSERT requires actor = auth.uid()");
  assert(!/\bfor update\b/i.test(sql), "no UPDATE policy");
  assert(!/\bfor delete\b/i.test(sql), "no DELETE policy");
  assert(
    /revoke update, delete on table public\.audit_events from authenticated/i.test(sql),
    "revoke update/delete",
  );
  assert(/revoke all on table public\.audit_events from anon/i.test(sql), "revoke anon");
  assert(
    /grant select, insert on table public\.audit_events to authenticated/i.test(sql),
    "grant select, insert",
  );
});

type Row = Record<string, unknown>;
const inserted: Row[] = [];
let insertError: { message: string } | null = null;

const fakeClient = {
  from(table: string) {
    return {
      insert(row: Row) {
        if (table !== "audit_events") {
          return Promise.resolve({ data: null, error: { message: `unexpected table ${table}` } });
        }
        if (insertError) {
          return Promise.resolve({ data: null, error: insertError });
        }
        inserted.push(row);
        return Promise.resolve({ data: null, error: null });
      },
    };
  },
};

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  if ((args[0] as string) === "server-only") return {};
  return origLoad.apply(this, args);
};

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TEAM = "22222222-2222-4222-8222-222222222222";
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENTITY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function ctx(overrides: Record<string, unknown> = {}) {
  return {
    supabase: fakeClient as never,
    teamId: TEAM_ID,
    workspaceId: WORKSPACE_ID as string | null,
    user: { id: USER_ID },
    ...overrides,
  };
}

const baseEvent = {
  domain: "people",
  action: "create",
  entityType: "employee",
  entityId: ENTITY_ID,
  prevState: { archived: false },
  nextState: { archived: true },
  metadata: { source: "test" },
};

(async () => {
  const { writeAuditEvent } = await import("@/lib/audit");

  inserted.length = 0;
  const ok = await writeAuditEvent(ctx(), baseEvent);
  assert(ok.ok === true, `expected ok, got ${JSON.stringify(ok)}`);
  assert(inserted.length === 1, `one row, got ${inserted.length}`);
  const row = inserted[0];
  assert(row.team_id === TEAM_ID, "team_id from context");
  assert(row.workspace_id === WORKSPACE_ID, "workspace_id from context");
  assert(row.actor_user_id === USER_ID, "actor from context");
  assert(row.domain === "people", "domain");
  assert(row.action === "create", "action");
  assert(row.entity_type === "employee", "entity_type");
  assert(row.entity_id === ENTITY_ID, "entity_id");
  assert((row.metadata as { source: string }).source === "test", "metadata");
  passed += 1;
  console.log("  ok  insert ok stamps context team, workspace, actor");

  inserted.length = 0;
  const forged = {
    ...baseEvent,
    team_id: OTHER_TEAM,
    teamId: OTHER_TEAM,
    actor_user_id: "forged-actor",
    actorUserId: "forged-actor",
  };
  const forgedResult = await writeAuditEvent(ctx(), forged as typeof baseEvent);
  assert(forgedResult.ok === true, "insert still ok");
  assert(inserted[0].team_id === TEAM_ID, "ignores event.team_id");
  assert(inserted[0].actor_user_id === USER_ID, "ignores event.actor_user_id");
  passed += 1;
  console.log("  ok  forged team/actor on the event object cannot override context");

  inserted.length = 0;
  const mutated = await writeAuditEvent(ctx({ teamId: OTHER_TEAM }), baseEvent);
  assert(mutated.ok === true, "ok");
  assert(inserted[0].team_id === OTHER_TEAM, "uses ctx.teamId");
  passed += 1;
  console.log("  ok  mutated ctx.teamId is what gets written (no request-body tenant)");

  inserted.length = 0;
  const missingTeam = await writeAuditEvent(ctx({ teamId: "" }), baseEvent);
  assert(missingTeam.ok === false, "must fail");
  assert(inserted.length === 0, "no insert");
  passed += 1;
  console.log("  ok  missing tenant context fails without insert");

  inserted.length = 0;
  const missingActor = await writeAuditEvent(ctx({ user: { id: "" } }), baseEvent);
  assert(missingActor.ok === false, "must fail");
  assert(inserted.length === 0, "no insert");
  passed += 1;
  console.log("  ok  missing actor fails without insert");

  inserted.length = 0;
  insertError = { message: "permission denied" };
  const insertFail = await writeAuditEvent(ctx(), baseEvent);
  insertError = null;
  assert(insertFail.ok === false, "must fail");
  assert(!insertFail.ok && insertFail.error === "permission denied", "surfaces insert error");
  assert(inserted.length === 0, "no row stored");
  passed += 1;
  console.log("  ok  insert error is returned, not swallowed");

  inserted.length = 0;
  const noWs = await writeAuditEvent(ctx({ workspaceId: null }), baseEvent);
  assert(noWs.ok === true, "ok");
  assert(inserted[0].workspace_id === null, "workspace_id null");
  passed += 1;
  console.log("  ok  null workspace is allowed");

  const { writeSystemAuditEvent } = await import("@/lib/audit");

  inserted.length = 0;
  const systemOk = await writeSystemAuditEvent(
    { supabase: fakeClient as never, teamId: TEAM_ID, workspaceId: WORKSPACE_ID },
    {
      domain: "people",
      action: "match",
      entityType: "job",
      entityId: ENTITY_ID,
      metadata: { processed: 2, scoring_version: "people.match.v1", scoring_weights_version: 1 },
    },
  );
  assert(systemOk.ok === true, "system write ok");
  assert(inserted.length === 1, "one system row");
  assert(inserted[0].actor_user_id === null, "null actor for system write");
  assert(inserted[0].action === "match", "action");
  passed += 1;
  console.log("  ok  writeSystemAuditEvent allows null actor for service-role writes");

  console.log(`audit.test.ts: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
