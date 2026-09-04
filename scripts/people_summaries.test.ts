/**
 * Wave 2 J1 — People summary formatters + embeddings.kind migration (no live OpenAI, no live DB).
 * Run: npx tsx scripts/people_summaries.test.ts  (or `npm run test:people-summaries`)
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Candidate, Employee, Job } from "@/types";
import {
  formatApplicationSummary,
  formatCandidateSummary,
  formatEmployeeSummary,
  formatJobSummary,
  PEOPLE_SUMMARY_MAX_CHARS,
} from "@/lib/people/summaries";

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
const file = migrationFiles.find((f) =>
  f.endsWith("_embeddings_people_summary_kind.sql"),
);

assert(!!file, "missing *_embeddings_people_summary_kind.sql");
assert(
  file! > "20260902170000_chat_proposed_actions.sql",
  `${file} must sort after chat_proposed_actions`,
);

const sql = readFileSync(join(migrationsDir, file!), "utf8");

check("migration extends embeddings.kind CHECK with people_summary", () => {
  assert(/drop constraint if exists embeddings_kind_check/i.test(sql), "drop check");
  assert(/add constraint embeddings_kind_check/i.test(sql), "add check");
  assert(/people_summary/.test(sql), "people_summary in SQL");
  assert(/business_doc/.test(sql) && /conversation/.test(sql) && /summary/.test(sql), "prior kinds remain");
  assert(!/create table/i.test(sql), "no new table");
});

const employee: Employee = {
  id: "e1",
  team_id: "t1",
  workspace_id: "w1",
  full_name: "Ada Lovelace",
  email: "ada@secret.example",
  phone: "+15550001111",
  role_title: "Engineer",
  employment_status: "active",
  started_on: "2024-01-01",
  ended_on: null,
  location: "London",
  notes: "CONFIDENTIAL_NOTE_DO_NOT_EMBED",
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

check("employee summary omits email, phone, and notes", () => {
  const text = formatEmployeeSummary(employee);
  assert(text.includes("Ada Lovelace"), "name");
  assert(text.includes("Engineer"), "role");
  assert(text.includes("active"), "status");
  assert(text.includes("London"), "location");
  assert(!text.includes("ada@secret.example"), "no email");
  assert(!text.includes("+15550001111"), "no phone");
  assert(!text.includes("CONFIDENTIAL_NOTE_DO_NOT_EMBED"), "no notes");
});

const job: Job = {
  id: "j1",
  team_id: "t1",
  workspace_id: "w1",
  title: "Staff Engineer",
  description: "Build the People platform. Contact hiring@secret.example for nothing.",
  status: "open",
  required_skills: ["TypeScript", "Postgres"],
  preferred_skills: [],
  experience_min_years: 5,
  experience_max_years: 12,
  seniority: "staff",
  location: "Remote",
  remote_policy: "remote",
  scoring_weights: {
    technical_fit: 0.4,
    experience_fit: 0.25,
    seniority_fit: 0.15,
    location_fit: 0.05,
    nice_to_have: 0.1,
    data_quality: 0.05,
  },
  scoring_weights_version: 1,
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

check("job summary includes skills and omits empty preferred list", () => {
  const text = formatJobSummary(job);
  assert(text.includes("Staff Engineer"), "title");
  assert(text.includes("TypeScript"), "required skill");
  assert(text.includes("Remote"), "location");
  assert(text.includes("staff"), "seniority");
  assert(!text.includes("Preferred Skills"), "no empty preferred heading");
  assert(!text.includes("hiring@secret.example"), "email in description redacted");
});

const candidate: Candidate = {
  id: "c1",
  team_id: "t1",
  workspace_id: "w1",
  full_name: "Grace Hopper",
  email: "grace@secret.example",
  phone: "555-0100",
  headline: "Compiler engineer",
  current_role: "Rear Admiral",
  experience_years: 20,
  skills: [],
  location: "Arlington",
  source: "github",
  source_url: "https://github.com/hopper-secret",
  source_metadata: { login: "hopper", html_url: "https://github.com/hopper-secret" },
  consent_status: "owner_imported",
  notes: "Do not put this in RAG",
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

check("candidate summary omits email, phone, notes, and URLs; empty skills omitted", () => {
  const text = formatCandidateSummary(candidate);
  assert(text.includes("Grace Hopper"), "name");
  assert(text.includes("Compiler engineer"), "headline");
  assert(text.includes("20"), "years");
  assert(!text.includes("Skills:"), "empty skills omitted");
  assert(!text.includes("grace@secret.example"), "no email");
  assert(!text.includes("555-0100"), "no phone");
  assert(!text.includes("Do not put this in RAG"), "no notes");
  assert(!text.includes("github.com"), "no URL");
  assert(!text.includes("hopper-secret"), "no source_url");
});

check("insufficient application uses insufficient_data, not a fake score", () => {
  const text = formatApplicationSummary({
    candidateName: "Pat",
    jobTitle: "Designer",
    stage: "new",
    matchScore: 47,
    dataQuality: "insufficient",
    insufficientReason: "No required-skill evidence",
    evidence: [],
    explanationSummary: null,
  });
  assert(text.includes("Pat"), "name");
  assert(text.includes("Designer"), "job");
  assert(text.includes("insufficient_data"), "insufficient label");
  assert(text.includes("No required-skill evidence"), "reason");
  assert(!text.includes("Match score: 47"), "must not show numeric score when insufficient");
});

check("application summary can include explanation and evidence, not archive text", () => {
  const text = formatApplicationSummary({
    candidateName: "Sam",
    jobTitle: "PM",
    stage: "shortlisted",
    matchScore: 82,
    dataQuality: "sufficient",
    insufficientReason: null,
    evidence: ["TypeScript listed on profile"],
    explanationSummary: "Strong technical fit for the role.",
  });
  assert(text.includes("Match score: 82"), "score");
  assert(text.includes("TypeScript listed on profile"), "evidence");
  assert(text.includes("Strong technical fit"), "explanation");
  assert(!text.includes("archived"), "no archive wording");
  assert(text.length <= PEOPLE_SUMMARY_MAX_CHARS, "cap");
});

console.log(`\npeople_summaries: ${passed}/6 checks passed`);
