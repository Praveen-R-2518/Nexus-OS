/**
 * Wave 1 B3 — Shared CSV engine (pure; no DB/network).
 * Run: npx tsx scripts/csv_engine.test.ts  (or `npm run test:csv-engine`)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CSV_DEFAULT_MAX_BYTES,
  CSV_FIELD_LIMITS,
  detectDelimiter,
  escapeCsvCell,
  isCsvFormulaInjection,
  parseCsv,
  planCsvImport,
  serializeCsv,
  suggestColumnMapping,
} from "@/lib/csv";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

function csvModulesMustStayPure(): void {
  const dir = join(process.cwd(), "lib/csv");
  for (const file of ["parse.ts", "profiles.ts", "plan.ts", "serialize.ts", "index.ts"]) {
    const src = readFileSync(join(dir, file), "utf8");
    assert(
      !/from ["']server-only["']/.test(src),
      `${file} must not import server-only`,
    );
    assert(!/from ["']next\//.test(src), `${file} must not import Next.js`);
    assert(
      !/from ["']@\/lib\/people\/employees["']/.test(src),
      `${file} must not import the employee service`,
    );
  }
}

check("csv modules stay pure (no Next.js / server-only / employee service)", () => {
  csvModulesMustStayPure();
});

check("quoted commas and escaped quotes parse as one field", () => {
  const parsed = parseCsv(
    'full_name,email,notes\n"Lovelace, Ada",ada@example.com,"He said ""hello, world"""\n',
  );
  assert(parsed.ok, "parse should succeed");
  if (!parsed.ok) return;
  assert(parsed.headers[0] === "full_name", "header");
  assert(parsed.rows.length === 1, "one data row");
  assert(parsed.rows[0][0] === "Lovelace, Ada", `name was ${parsed.rows[0][0]}`);
  assert(parsed.rows[0][2] === 'He said "hello, world"', `notes was ${parsed.rows[0][2]}`);
});

check("malformed CSV with unclosed quotes is a file error", () => {
  const parsed = parseCsv('full_name,email\n"Ada Lovelace,ada@example.com\n');
  assert(!parsed.ok, "must fail");
  if (parsed.ok) return;
  assert(/unclosed/i.test(parsed.error), `error was ${parsed.error}`);
});

check("empty CSV is a file error", () => {
  const parsed = parseCsv("   \n");
  assert(!parsed.ok, "must fail");
});

check("BOM is stripped and comma delimiter is detected", () => {
  const parsed = parseCsv("\uFEFFfull_name,email\nAda,ada@example.com\n");
  assert(parsed.ok, "parse should succeed");
  if (!parsed.ok) return;
  assert(parsed.delimiter === ",", `delimiter ${parsed.delimiter}`);
  assert(parsed.headers[0] === "full_name", "bom must not leak into header");
});

check("semicolon delimiter is detected from the header line", () => {
  assert(detectDelimiter("Name;Email;Phone") === ";", "detect ;");
  const plan = planCsvImport({
    profile: "employee",
    text: "Name;Email;Phone\nAda Lovelace;ada@example.com;+94771234567\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.delimiter === ";", `delimiter ${plan.delimiter}`);
  assert(plan.summary.imported === 1, "one imported");
  assert(plan.rows[0].values.phone === "+94771234567", "phone kept");
});

check("tab delimiter is detected when it dominates the header", () => {
  assert(detectDelimiter("Name\tEmail") === "\t", "detect tab");
});

check("missing required columns is a file error", () => {
  const plan = planCsvImport({
    profile: "employee",
    text: "email,phone\nada@example.com,+9477\n",
  });
  assert(!plan.ok, "must fail");
  if (plan.ok) return;
  assert(/full_name/.test(plan.error), `error was ${plan.error}`);
});

check("empty required cell fails that row, not the file", () => {
  const plan = planCsvImport({
    profile: "employee",
    text: "full_name,email\n,missing@example.com\nAda Lovelace,ada@example.com\n",
  });
  assert(plan.ok, "file should parse");
  if (!plan.ok) return;
  assert(plan.summary.failed === 1, `failed ${plan.summary.failed}`);
  assert(plan.summary.imported === 1, `imported ${plan.summary.imported}`);
  assert(plan.rows[0].action === "failed", "first row failed");
  assert(plan.rows[0].row === 2, "spreadsheet row 2");
});

check("in-file duplicate emails are duplicates after the first valid row", () => {
  const plan = planCsvImport({
    profile: "employee",
    text:
      "full_name,email\nAda Lovelace,ada@example.com\nAda Clone,ada@example.com\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.summary.imported === 1, "first is imported");
  assert(plan.summary.duplicates === 1, "second is duplicate");
  assert(plan.rows[1].action === "duplicate", "duplicate action");
  assert(plan.rows[1].row === 3, "duplicate is spreadsheet row 3");
});

check("existingKeys classifies a matching email as updated", () => {
  const plan = planCsvImport({
    profile: "employee",
    existingKeys: ["ADA@example.com"],
    text:
      "full_name,email\nAda Lovelace,ada@example.com\nGrace Hopper,grace@example.com\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.summary.updated === 1, `updated ${plan.summary.updated}`);
  assert(plan.summary.imported === 1, `imported ${plan.summary.imported}`);
  assert(plan.rows[0].action === "updated", "existing email is updated");
  assert(plan.rows[1].action === "imported", "new email is imported");
});

check("rows without email still import and do not collide", () => {
  const plan = planCsvImport({
    profile: "employee",
    text: "full_name,role_title\nAda Lovelace,Engineer\nGrace Hopper,Admiral\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.summary.imported === 2, "both imported");
  assert(plan.rows[0].values.email === null, "email default null");
  assert(plan.rows[0].values.employment_status === "active", "status default");
});

check("=CMD formula cells fail the row", () => {
  const plan = planCsvImport({
    profile: "employee",
    text: "full_name,email,notes\nAda Lovelace,ada@example.com,=CMD\n",
  });
  assert(plan.ok, "file should parse");
  if (!plan.ok) return;
  assert(plan.summary.failed === 1, "formula row failed");
  assert(
    plan.rows[0].errors.some((e) => /formula/i.test(e.message)),
    "formula error message",
  );
});

check("+CMD and @SUM formula cells fail; +phone does not", () => {
  assert(isCsvFormulaInjection("=CMD") === true, "=CMD");
  assert(isCsvFormulaInjection("@SUM(1)") === true, "@SUM");
  assert(isCsvFormulaInjection("+CMD") === true, "+CMD");
  assert(isCsvFormulaInjection("-HYPERLINK(x)") === true, "-HYPERLINK");
  assert(isCsvFormulaInjection("+94771234567") === false, "phone");
  assert(isCsvFormulaInjection("+ 94 77") === false, "phone with space");
  assert(isCsvFormulaInjection("Ada") === false, "name");

  const plan = planCsvImport({
    profile: "employee",
    text: "full_name,phone\nAda Lovelace,+94771234567\n",
  });
  assert(plan.ok && plan.summary.imported === 1, "phone row imported");
  if (!plan.ok) return;
  assert(plan.rows[0].values.phone === "+94771234567", "phone value");
});

check("cell over field max fails that row", () => {
  const tooLong = "A".repeat(CSV_FIELD_LIMITS.full_name + 1);
  const plan = planCsvImport({
    profile: "employee",
    text: `full_name,email\n${tooLong},ada@example.com\n`,
  });
  assert(plan.ok, "file should parse");
  if (!plan.ok) return;
  assert(plan.summary.failed === 1, "over-max row failed");
  assert(/exceeds/.test(plan.rows[0].errors[0]?.message ?? ""), "max message");
});

check("input over maxBytes fails the file", () => {
  const text = "full_name,email\nAda Lovelace,ada@example.com\n";
  const plan = planCsvImport({
    profile: "employee",
    text,
    maxBytes: 8,
  });
  assert(!plan.ok, "must fail");
  if (plan.ok) return;
  assert(/byte size limit/.test(plan.error), `error was ${plan.error}`);
});

check("default maxBytes is 1 MB", () => {
  assert(CSV_DEFAULT_MAX_BYTES === 1_000_000, "1 MB cap");
});

check("suggestColumnMapping maps aliases for employee and candidate", () => {
  const employee = suggestColumnMapping(
    ["Full Name", "E-mail", "Job Title", "Status"],
    "employee",
  );
  assert(employee["Full Name"] === "full_name", "employee name");
  assert(employee["E-mail"] === "email", "employee email");
  assert(employee["Job Title"] === "role_title", "employee role");
  assert(employee["Status"] === "employment_status", "employee status");

  const candidate = suggestColumnMapping(
    ["Name", "Title", "Years of experience", "Skills"],
    "candidate",
  );
  assert(candidate.Name === "full_name", "candidate name");
  assert(candidate.Title === "current_role", "candidate role");
  assert(candidate["Years of experience"] === "experience_years", "yoe");
  assert(candidate.Skills === "skills", "skills");
});

check("unmapped extra columns are ignored", () => {
  const plan = planCsvImport({
    profile: "employee",
    text: "full_name,email,favorite_color\nAda Lovelace,ada@example.com,blue\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.summary.imported === 1, "imported");
  assert(
    !Object.prototype.hasOwnProperty.call(plan.rows[0].values, "favorite_color"),
    "extra column ignored",
  );
});

check("invalid email, date, and employment_status fail the row", () => {
  const plan = planCsvImport({
    profile: "employee",
    text:
      "full_name,email,started_on,employment_status\n" +
      "Ada,not-an-email,2024-01-15,active\n" +
      "Grace,grace@example.com,15/01/2024,active\n" +
      "Alan,alan@example.com,2024-01-15,contractor\n" +
      "Good,good@example.com,2024-01-15,Onboarding\n",
  });
  assert(plan.ok, "file should parse");
  if (!plan.ok) return;
  assert(plan.summary.failed === 3, `failed ${plan.summary.failed}`);
  assert(plan.summary.imported === 1, "cased Onboarding still imports");
  assert(plan.rows[3].values.employment_status === "onboarding", "enum lowercased");
});

check("candidate skills split and consent_status defaults to owner_imported", () => {
  const plan = planCsvImport({
    profile: "candidate",
    text:
      "full_name,email,skills,experience_years\n" +
      "Ada Lovelace,ada@example.com,\"TypeScript; React, Node\",8\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.summary.imported === 1, "imported");
  const row = plan.rows[0];
  assert(row.values.consent_status === "owner_imported", "default consent");
  assert(
    JSON.stringify(row.values.skills) === JSON.stringify(["TypeScript", "React", "Node"]),
    `skills were ${JSON.stringify(row.values.skills)}`,
  );
  assert(row.values.experience_years === 8, "years");
});

check("blank candidate consent_status still defaults; explicit value is kept", () => {
  const plan = planCsvImport({
    profile: "candidate",
    text:
      "full_name,consent_status\nAda Lovelace,\nGrace Hopper,candidate_applied\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.rows[0].values.consent_status === "owner_imported", "blank default");
  assert(plan.rows[1].values.consent_status === "candidate_applied", "explicit");
});

check("explicit mapping overrides aliases", () => {
  const plan = planCsvImport({
    profile: "employee",
    mapping: { Label: "full_name", Mail: "email" },
    text: "Label,Mail\nAda Lovelace,ada@example.com\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.mapping.Label === "full_name", "explicit map");
  assert(plan.summary.imported === 1, "imported");
});

check("duplicate then valid uses the first valid row as identity", () => {
  const plan = planCsvImport({
    profile: "employee",
    text:
      "full_name,email\n" +
      ",ada@example.com\n" +
      "Ada Lovelace,ada@example.com\n" +
      "Ada Clone,ada@example.com\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.rows[0].action === "failed", "empty name failed");
  assert(plan.rows[1].action === "imported", "first valid imported");
  assert(plan.rows[2].action === "duplicate", "later duplicate");
});

check("maxRows over-cap is a file error", () => {
  const plan = planCsvImport({
    profile: "employee",
    maxRows: 2,
    text:
      "full_name,email\n" +
      "Ada Lovelace,ada@example.com\n" +
      "Grace Hopper,grace@example.com\n" +
      "Alan Turing,alan@example.com\n",
  });
  assert(!plan.ok, "must fail");
  if (plan.ok) return;
  assert(/row limit/.test(plan.error), `error was ${plan.error}`);
});

check("maxRows equal to data-row count is allowed", () => {
  const plan = planCsvImport({
    profile: "employee",
    maxRows: 2,
    text:
      "full_name,email\nAda Lovelace,ada@example.com\nGrace Hopper,grace@example.com\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.summary.imported === 2, "both imported");
});

check("serializeCsv quotes commas and doubles internal quotes", () => {
  const csv = serializeCsv(
    ["full_name", "notes"],
    [["Lovelace, Ada", 'He said "hello"']],
  );
  assert(
    csv === 'full_name,notes\r\n"Lovelace, Ada","He said ""hello"""\r\n',
    `got ${JSON.stringify(csv)}`,
  );
});

check("serializeCsv formula-escapes =CMD and @SUM; leaves +phone", () => {
  assert(escapeCsvCell("=CMD") === `"'=CMD"`, "=CMD prefixed");
  assert(escapeCsvCell("@SUM(1)") === `"'@SUM(1)"`, "@SUM prefixed");
  assert(escapeCsvCell("+CMD") === `"'+CMD"`, "+CMD prefixed and quoted");
  assert(escapeCsvCell("+94771234567") === "+94771234567", "phone unescaped");
  assert(escapeCsvCell("Ada") === "Ada", "plain text");
});

check("empty data rows are skipped and do not shift spreadsheet row numbers", () => {
  const plan = planCsvImport({
    profile: "employee",
    text: "full_name,email\nAda Lovelace,ada@example.com\n\n\nGrace Hopper,grace@example.com\n",
  });
  assert(plan.ok, "plan should succeed");
  if (!plan.ok) return;
  assert(plan.rows.length === 2, `rows ${plan.rows.length}`);
  assert(plan.rows[0].row === 2, "first data row");
  assert(plan.rows[1].row === 5, "grace stays on spreadsheet row 5");
});

console.log(`\ncsv-engine: ${passed} checks passed`);
