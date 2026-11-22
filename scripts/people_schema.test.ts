/**
 * Wave 1 A2 — People schema + RLS.
 * Run: npx tsx scripts/people_schema.test.ts  (or `npm run test:people-schema`)
 *
 * File-read assertions (no live DB):
 *  four tables, tenant columns, enum checks, partial unique emails,
 *  RLS + current_team_id, ranking index, reuse of team-stamp trigger.
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
const peopleFile = migrationFiles.find((f) => f.endsWith("_people_schema.sql"));

assert(!!peopleFile, "missing *_people_schema.sql migration");
assert(
  peopleFile! > "20260901120000_audit_events.sql",
  `${peopleFile} must sort after 20260901120000_audit_events.sql`,
);
assert(latest >= peopleFile!, "people_schema migration must be among sorted SQL files");

const sql = readFileSync(join(migrationsDir, peopleFile!), "utf8");

const tables = ["employees", "jobs", "candidates", "candidate_jobs"] as const;

check("creates all four People tables", () => {
  for (const t of tables) {
    assert(
      new RegExp(`create table if not exists public\\.${t}\\b`, "i").test(sql),
      `create table ${t}`,
    );
  }
});

check("tenant columns and no organization_id or salary", () => {
  for (const t of tables) {
    assert(
      sql.includes(`create table if not exists public.${t}`),
      `${t} present`,
    );
  }
  assert(/team_id uuid not null references public\.teams/i.test(sql), "team_id FK to teams");
  assert(/workspace_id uuid references public\.workspaces/i.test(sql), "workspace_id FK to workspaces");
  assert(!/organization_id/i.test(sql), "must not use organization_id");
  assert(
    !/\bsalary\s+(text|numeric|integer|decimal|money)\b/i.test(sql),
    "must not add salary columns",
  );
});

check("does not create background_jobs or people_activity", () => {
  assert(!/create table if not exists public\.background_jobs/i.test(sql), "no background_jobs");
  assert(!/create table if not exists public\.people_activity/i.test(sql), "no people_activity");
});

check("employment_status, job status, consent_status, and four stages", () => {
  assert(
    /employment_status in \('active', 'onboarding', 'resignation_pending', 'offboarded'\)/i.test(sql),
    "employment_status allowlist",
  );
  assert(/status in \('draft', 'open', 'closed'\)/i.test(sql), "job status");
  assert(
    /consent_status in \('owner_imported', 'candidate_applied', 'unknown'\)/i.test(sql),
    "consent_status",
  );
  assert(
    /stage in \('new', 'shortlisted', 'contacted', 'decision'\)/i.test(sql),
    "four pipeline stages",
  );
  assert(
    !/'applied'|nine.?stage|phone_screen|'offer'/i.test(sql),
    "no extra ATS stages",
  );
});

check("partial unique emails per team for non-archived employees and candidates", () => {
  assert(
    /on public\.employees \(team_id, lower\(email\)\)/i.test(sql),
    "employees unique (team_id, lower(email))",
  );
  assert(
    /on public\.candidates \(team_id, lower\(email\)\)/i.test(sql),
    "candidates unique (team_id, lower(email))",
  );
  const emailWhere = /where email is not null and archived_at is null/gi;
  const whereHits = sql.match(emailWhere) ?? [];
  assert(whereHits.length >= 2, `two partial unique filters, got ${whereHits.length}`);
});

check("candidate_jobs unique pair and ranking index", () => {
  assert(/unique \(candidate_id, job_id\)/i.test(sql), "unique (candidate_id, job_id)");
  assert(
    /on public\.candidate_jobs \(job_id, match_score desc nulls last\)/i.test(sql),
    "job_id, match_score desc",
  );
  assert(/on public\.candidate_jobs \(team_id, job_id\)/i.test(sql), "team_id, job_id list index");
});

check("RLS enabled with current_team_id on every table", () => {
  for (const t of tables) {
    assert(
      new RegExp(`alter table public\\.${t} enable row level security`, "i").test(sql),
      `RLS ${t}`,
    );
    assert(
      new RegExp(`on public\\.${t}\\s+for select to authenticated`, "i").test(sql),
      `SELECT ${t}`,
    );
    assert(
      new RegExp(`on public\\.${t}\\s+for insert to authenticated`, "i").test(sql),
      `INSERT ${t}`,
    );
    assert(
      new RegExp(`on public\\.${t}\\s+for update to authenticated`, "i").test(sql),
      `UPDATE ${t}`,
    );
    assert(
      new RegExp(`on public\\.${t}\\s+for delete to authenticated`, "i").test(sql),
      `DELETE ${t}`,
    );
    assert(
      new RegExp(`revoke all on table public\\.${t} from anon`, "i").test(sql),
      `revoke anon ${t}`,
    );
    assert(
      new RegExp(
        `grant select, insert, update, delete on table public\\.${t} to authenticated`,
        "i",
      ).test(sql),
      `grant CRUD ${t}`,
    );
  }
  const teamIdHits = sql.match(/private\.current_team_id\(\)/g) ?? [];
  assert(teamIdHits.length >= 16, `current_team_id in policies, got ${teamIdHits.length}`);
});

check("reuses trg_chat_set_team_from_workspace, does not redefine it", () => {
  assert(
    /execute function public\.trg_chat_set_team_from_workspace\(\)/i.test(sql),
    "execute existing stamp function",
  );
  assert(
    !/create or replace function public\.trg_chat_set_team_from_workspace/i.test(sql),
    "must not redefine stamp function",
  );
  for (const t of tables) {
    assert(
      new RegExp(`trg_${t}_set_team_from_workspace`, "i").test(sql),
      `stamp trigger ${t}`,
    );
    assert(
      new RegExp(`trg_${t}_updated_at`, "i").test(sql),
      `updated_at trigger ${t}`,
    );
  }
  assert(
    /execute function public\.handle_chat_sessions_updated_at\(\)/i.test(sql),
    "reuse updated_at function",
  );
});

check("table comments present", () => {
  for (const t of tables) {
    assert(
      new RegExp(`comment on table public\\.${t}\\b`, "i").test(sql),
      `comment ${t}`,
    );
  }
});

check("quoted current_role column (reserved word in Postgres)", () => {
  assert(/"current_role" text/.test(sql), 'candidates."current_role" quoted');
  assert(!/^\s+current_role text,/m.test(sql), "unquoted current_role would fail on hosted Postgres");
});

check("default scoring weights keys on jobs", () => {
  assert(/scoring_weights jsonb not null/i.test(sql), "scoring_weights column");
  assert(/scoring_weights_version integer not null default 1/i.test(sql), "weights version");
  for (const key of [
    "technical_fit",
    "experience_fit",
    "seniority_fit",
    "location_fit",
    "nice_to_have",
    "data_quality",
  ]) {
    assert(sql.includes(`"${key}"`), `weight key ${key}`);
  }
});

console.log(`people_schema.test.ts: ${passed} checks passed`);
