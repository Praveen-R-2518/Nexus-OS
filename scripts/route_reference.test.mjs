/**
 * Static check (Task E.8): the critical UI + API routes this app depends on for founder-facing
 * navigation and OAuth callback redirects must exist as real files. This is a cheap guard against
 * silently deleting/renaming a page during a refactor (e.g. `/profile` being the settings
 * destination — see app/settings/page.tsx and app/api/meta/helpers.ts) without updating every
 * link/redirect that points at it.
 *
 * Run: npm run test:route-reference
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// UI pages that founders / OAuth callbacks navigate to directly.
const uiPages = [
  "app/profile/page.tsx",
  "app/logs/page.tsx",
  "app/approval/page.tsx",
  "app/inbox/page.tsx",
  "app/dashboard/page.tsx",
];

// API routes those pages (or their redirects) rely on.
const apiRoutes = [
  "app/api/approval/route.ts",
  "app/api/workflow-logs/route.ts",
  "app/settings/page.tsx", // legacy alias — must keep forwarding to /profile
];

for (const relPath of [...uiPages, ...apiRoutes]) {
  assert(existsSync(resolve(root, relPath)), `missing critical route file: ${relPath}`);
}

// Middleware must protect /profile and /logs (auth redirect to /login).
const middlewareSrc = readFileSync(resolve(root, "middleware.ts"), "utf8");
assert(
  middlewareSrc.includes('"/profile"') && middlewareSrc.includes('"/logs"'),
  "middleware.ts must list /profile and /logs in protected routes",
);

// /settings must redirect to /profile (legacy alias).
const settingsSrc = readFileSync(resolve(root, "app/settings/page.tsx"), "utf8");
assert(
  settingsSrc.includes("redirect(") && settingsSrc.includes("/profile"),
  "app/settings/page.tsx must redirect to /profile",
);

// Guard against re-introducing a stale iCloud-conflict duplicate for any of these routes
// (see CLAUDE.md — "NEVER read, edit, or import a file whose name contains ' 2' before the
// extension"). If one of these ever appears, canonical files may have been silently replaced.
function findDuplicateSiblings(relDir) {
  const dirPath = resolve(root, relDir);
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath).filter((name) => / 2\.[a-zA-Z0-9]+$/.test(name));
}

const watchedDirs = [
  "app/profile",
  "app/logs",
  "app/approval",
  "app/inbox",
  "app/dashboard",
  "app/api/approval",
  "app/api/workflow-logs",
  "app/settings",
];

for (const dir of watchedDirs) {
  const dupes = findDuplicateSiblings(dir);
  assert(dupes.length === 0, `found stale iCloud duplicate(s) in ${dir}: ${dupes.join(", ")}`);
}

console.log("route reference checks passed.");
