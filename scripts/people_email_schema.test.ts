/**
 * Wave 1 F2 — people_message_drafts schema + RLS (file-read, no live DB).
 * Run: npx tsx scripts/people_email_schema.test.ts
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
const file = migrationFiles.find((f) => f.endsWith("_people_message_drafts.sql"));

assert(!!file, "missing *_people_message_drafts.sql migration");
assert(
  file! > "20260902150000_candidate_jobs_scoring_version_text.sql",
  `${file} must sort after 20260902150000_candidate_jobs_scoring_version_text.sql`,
);
assert(latest >= file!, "people_message_drafts migration must be among sorted SQL files");

const sql = readFileSync(join(migrationsDir, file!), "utf8");

check("creates people_message_drafts", () => {
  assert(
    /create table if not exists public\.people_message_drafts\b/i.test(sql),
    "create table",
  );
});

check("tenant columns and no organization_id", () => {
  assert(/team_id uuid not null references public\.teams/i.test(sql), "team_id FK");
  assert(
    /workspace_id uuid references public\.workspaces/i.test(sql),
    "workspace_id FK",
  );
  assert(!/organization_id/i.test(sql), "must not use organization_id");
  assert(!/create table if not exists public\.people_activity/i.test(sql), "no people_activity");
});

check("exclusive employee/candidate recipient FKs", () => {
  assert(/employee_id uuid references public\.employees/i.test(sql), "employee_id FK");
  assert(/candidate_id uuid references public\.candidates/i.test(sql), "candidate_id FK");
  assert(
    /constraint people_message_drafts_recipient_chk/i.test(sql),
    "recipient check name",
  );
  assert(
    /recipient_type = 'employee'[\s\S]*employee_id is not null[\s\S]*candidate_id is null/i.test(
      sql,
    ),
    "employee exclusive",
  );
  assert(
    /recipient_type = 'candidate'[\s\S]*candidate_id is not null[\s\S]*employee_id is null/i.test(
      sql,
    ),
    "candidate exclusive",
  );
});

check("status, transport, and snapshot columns", () => {
  assert(/status in \('draft', 'sent', 'discarded'\)/i.test(sql), "status allowlist");
  assert(
    /transport in \('gmail', 'smtp', 'sandbox'\)/i.test(sql),
    "transport allowlist",
  );
  assert(/recipient_email text not null/i.test(sql), "snapshot email");
  assert(/subject text not null/i.test(sql), "subject");
  assert(/body text not null/i.test(sql), "body");
  assert(/related_date date/i.test(sql), "related_date");
});

check("RLS with current_team_id", () => {
  assert(
    /alter table public\.people_message_drafts enable row level security/i.test(sql),
    "RLS enabled",
  );
  for (const action of ["select", "insert", "update", "delete"]) {
    assert(
      new RegExp(
        `on public\\.people_message_drafts\\s+for ${action} to authenticated`,
        "i",
      ).test(sql),
      `${action} policy`,
    );
  }
  const teamIdHits = sql.match(/private\.current_team_id\(\)/g) ?? [];
  assert(teamIdHits.length >= 4, `current_team_id in policies, got ${teamIdHits.length}`);
  assert(/revoke all on table public\.people_message_drafts from anon/i.test(sql), "revoke anon");
  assert(
    /grant select, insert, update, delete on table public\.people_message_drafts to authenticated/i.test(
      sql,
    ),
    "grant CRUD",
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
    /trg_people_message_drafts_set_team_from_workspace/i.test(sql),
    "stamp trigger",
  );
  assert(/trg_people_message_drafts_updated_at/i.test(sql), "updated_at trigger");
  assert(
    /execute function public\.handle_chat_sessions_updated_at\(\)/i.test(sql),
    "reuse updated_at function",
  );
});

check("indexes on team created_at and status", () => {
  assert(
    /on public\.people_message_drafts \(team_id, created_at desc\)/i.test(sql),
    "created_at index",
  );
  assert(
    /on public\.people_message_drafts \(team_id, status\)/i.test(sql),
    "status index",
  );
});

console.log(`people_email_schema.test.ts: ${passed} checks passed`);
