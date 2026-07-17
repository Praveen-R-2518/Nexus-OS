/**
 * Static checks: schema remediation migration ordering and content.
 * Run: npm run test:migration-order
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const migrationsDir = resolve(root, "supabase/migrations");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const foundation = "20260709115800_create_organizations_user_profiles_foundation.sql";
const social = "20260709115940_create_social_posting_tables.sql";
const bridge = "20260717120000_teams_organization_id_bridge.sql";
const durability = "20260717130000_launch_durability_and_tokens.sql";
const dailyReports = "20260709115700_daily_reports_wf_columns.sql";

for (const file of [foundation, social, bridge, durability, dailyReports]) {
  assert(
    existsSync(resolve(migrationsDir, file)),
    `missing migration: ${file}`,
  );
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const foundationIdx = migrationFiles.indexOf(foundation);
const socialIdx = migrationFiles.indexOf(social);
const dailyIdx = migrationFiles.indexOf(dailyReports);

assert(foundationIdx >= 0, `${foundation} must exist`);
assert(socialIdx >= 0, `${social} must exist`);
assert(foundationIdx < socialIdx, `${foundation} must sort before ${social}`);
assert(dailyIdx < socialIdx, `${dailyReports} must sort before ${social}`);

const foundationSql = readFileSync(resolve(migrationsDir, foundation), "utf8");
assert(
  /create table if not exists public\.organizations/i.test(foundationSql),
  "foundation must create organizations",
);
assert(
  /create table if not exists public\.user_profiles/i.test(foundationSql),
  "foundation must create user_profiles",
);

const bridgeSql = readFileSync(resolve(migrationsDir, bridge), "utf8");
assert(
  bridgeSql.includes("organization_id") && bridgeSql.includes("public.teams"),
  "bridge must add teams.organization_id",
);

const notes = readFileSync(resolve(migrationsDir, "MIGRATION_NOTES.md"), "utf8");
assert(
  /0004.*must not be run|do NOT apply|must \*\*not\*\* be applied/i.test(notes),
  "MIGRATION_NOTES must warn that 0004/0005 do not apply",
);
assert(
  notes.includes("0004_gmail_product_alignment") &&
    notes.includes("0005_remove_whatsapp"),
  "MIGRATION_NOTES must reference 0004 and 0005",
);

console.log("migration order checks passed.");
