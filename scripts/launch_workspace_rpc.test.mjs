/**
 * Static checks: guard migration drops stale overload; clients call canonical RPC args.
 * Run: node scripts/launch_workspace_rpc.test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const guardMigration = readFileSync(
  resolve(root, "supabase/migrations/20260603120000_drop_duplicate_launch_workspace.sql"),
  "utf8",
);
assert(
  guardMigration.includes(
    "drop function if exists public.launch_workspace(text, text, text, text[], text)",
  ),
  "guard migration must drop stale overload",
);
assert(
  guardMigration.includes("expected 1 overload"),
  "guard migration must verify single overload",
);

const canonicalMigration = readFileSync(
  resolve(root, "supabase/migrations/20260527120000_tenant_onboarding_launch.sql"),
  "utf8",
);
assert(
  /create or replace function public\.launch_workspace\(\s*company_name text,\s*invite_emails text\[\]/s.test(
    canonicalMigration,
  ),
  "canonical launch_workspace parameter order in tenant_onboarding_launch",
);

const onboarding = readFileSync(resolve(root, "app/onboarding/page.tsx"), "utf8");
const stepWorkspace = readFileSync(
  resolve(root, "components/signup/StepWorkspace.tsx"),
  "utf8",
);

for (const [label, src] of [
  ["onboarding", onboarding],
  ["StepWorkspace", stepWorkspace],
]) {
  assert(src.includes('supabase.rpc("launch_workspace"'), `${label}: rpc call`);
  assert(src.includes("company_name"), `${label}: company_name`);
  assert(src.includes("invite_emails"), `${label}: invite_emails`);
  assert(src.includes("workspace_type"), `${label}: workspace_type`);
  assert(/\bindustry\b/.test(src), `${label}: industry`);
  assert(src.includes("company_size"), `${label}: company_size`);
}

console.log("launch_workspace RPC contract checks passed.");
