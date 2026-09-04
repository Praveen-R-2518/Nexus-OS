/**
 * Wave 2 G3 — chat_proposed_actions schema + RLS (file-read, no live DB).
 * Run: npx tsx scripts/chat_proposed_actions_schema.test.ts
 */

import { readdirSync, readFileSync } from "node:fs";
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
const file = migrationFiles.find((f) => f.endsWith("_chat_proposed_actions.sql"));

assert(!!file, "missing *_chat_proposed_actions.sql migration");
assert(
  file! > "20260902160000_people_message_drafts.sql",
  `${file} must sort after 20260902160000_people_message_drafts.sql`,
);
assert(latest >= file!, "chat_proposed_actions migration must be among sorted SQL files");

const sql = readFileSync(join(migrationsDir, file!), "utf8");

check("creates chat_proposed_actions", () => {
  assert(
    /create table if not exists public\.chat_proposed_actions\b/i.test(sql),
    "create table",
  );
});

check("tenant columns, session FK, and no organization_id", () => {
  assert(/team_id uuid not null references public\.teams/i.test(sql), "team_id FK");
  assert(
    /workspace_id uuid references public\.workspaces/i.test(sql),
    "workspace_id FK",
  );
  assert(
    /session_id uuid not null references public\.chat_sessions/i.test(sql),
    "session_id FK",
  );
  assert(/on delete cascade/i.test(sql), "session cascade");
  assert(!/organization_id/i.test(sql), "must not use organization_id");
});

check("kind and status allowlists", () => {
  assert(
    /kind in \('set_pipeline_stage', 'set_employment_status'\)/i.test(sql),
    "kind allowlist",
  );
  assert(
    /status in \('pending', 'confirmed', 'cancelled', 'expired', 'failed'\)/i.test(
      sql,
    ),
    "status allowlist",
  );
  assert(/payload jsonb not null/i.test(sql), "payload");
  assert(/summary text not null/i.test(sql), "summary");
});

check("RLS with current_team_id (no delete policy)", () => {
  assert(
    /alter table public\.chat_proposed_actions enable row level security/i.test(sql),
    "RLS enabled",
  );
  for (const action of ["select", "insert", "update"]) {
    assert(
      new RegExp(
        `on public\\.chat_proposed_actions\\s+for ${action} to authenticated`,
        "i",
      ).test(sql),
      `${action} policy`,
    );
  }
  assert(
    !/on public\.chat_proposed_actions\s+for delete to authenticated/i.test(sql),
    "no delete policy",
  );
  const teamIdHits = sql.match(/private\.current_team_id\(\)/g) ?? [];
  assert(teamIdHits.length >= 3, `current_team_id in policies, got ${teamIdHits.length}`);
  assert(
    /revoke all on table public\.chat_proposed_actions from anon/i.test(sql),
    "revoke anon",
  );
  assert(
    /grant select, insert, update on table public\.chat_proposed_actions to authenticated/i.test(
      sql,
    ),
    "grant select/insert/update",
  );
  assert(
    !/grant select, insert, update, delete on table public\.chat_proposed_actions/i.test(
      sql,
    ),
    "must not grant delete",
  );
});

check("reuses stamp and updated_at functions", () => {
  assert(
    /execute function public\.trg_chat_set_team_from_workspace\(\)/i.test(sql),
    "stamp function",
  );
  assert(
    !/create or replace function public\.trg_chat_set_team_from_workspace/i.test(sql),
    "must not redefine stamp function",
  );
  assert(
    /trg_chat_proposed_actions_set_team_from_workspace/i.test(sql),
    "stamp trigger",
  );
  assert(/trg_chat_proposed_actions_updated_at/i.test(sql), "updated_at trigger");
  assert(
    /execute function public\.handle_chat_sessions_updated_at\(\)/i.test(sql),
    "reuse updated_at function",
  );
});

check("indexes on team session created_at and status", () => {
  assert(
    /on public\.chat_proposed_actions \(team_id, session_id, created_at desc\)/i.test(
      sql,
    ),
    "session created_at index",
  );
  assert(
    /on public\.chat_proposed_actions \(team_id, status\)/i.test(sql),
    "status index",
  );
});

console.log(`chat_proposed_actions_schema.test.ts: ${passed} checks passed`);
