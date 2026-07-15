/**
 * Focused checks for the Post unit's tenant-safe pure helpers:
 *  - storage paths are always prefixed with the org id (required by the
 *    storage.objects RLS policy) and keep a sane extension
 *  - captionsFromText mirrors a manual caption onto every selected platform
 *  - the lifecycle constants match the approval-free flow
 *    (draft -> scheduled -> publishing -> published/failed)
 *
 * Run: tsx scripts/social_posts_unit.test.ts
 */

import { buildStoragePath, captionsFromText } from "../lib/posts/data";
import { BOARD_FILTER_STATUSES, POST_STATUSES } from "../lib/posts/types";

function assert(cond: unknown, msg?: string): void {
  if (!cond) throw new Error(msg || "assertion failed");
}

const ORG = "9f1c1b2a-0000-4000-8000-abcabcabcabc";

function main() {
  // --- buildStoragePath -----------------------------------------------------
  const p1 = buildStoragePath(ORG, "vacation.PNG");
  assert(p1.startsWith(`${ORG}/`), `path must be org-scoped, got ${p1}`);
  assert(p1.endsWith(".png"), `extension should be lowercased png, got ${p1}`);

  const p2 = buildStoragePath(ORG, "no-extension-here");
  assert(p2.endsWith(".png"), `missing extension should default to png, got ${p2}`);

  const p3 = buildStoragePath(ORG, "clip.jpeg");
  assert(p3.endsWith(".jpeg"), `should preserve jpeg, got ${p3}`);

  const p4 = buildStoragePath(ORG, "a.png");
  const p5 = buildStoragePath(ORG, "a.png");
  assert(p4 !== p5, "two uploads of the same filename must not collide");

  assert(p1.split("/")[0] === ORG, "folder segment must be the org id");

  // --- captionsFromText -----------------------------------------------------
  const caps = captionsFromText("  Launch day!  ", ["instagram", "x"]);
  assert(caps.instagram?.caption === "Launch day!", "caption should be trimmed + mirrored");
  assert(caps.x?.caption === "Launch day!", "caption should apply to every selected platform");
  assert(Array.isArray(caps.instagram?.hashtags), "hashtags should default to an array");
  assert(Object.keys(captionsFromText("", ["instagram"])).length === 0, "empty text yields no captions");

  // --- lifecycle constants --------------------------------------------------
  assert(
    !(POST_STATUSES as readonly string[]).includes("pending_approval") &&
      !(POST_STATUSES as readonly string[]).includes("approved"),
    "approval statuses must be gone from the post lifecycle",
  );
  assert(
    (POST_STATUSES as readonly string[]).includes("scheduled") &&
      (POST_STATUSES as readonly string[]).includes("publishing"),
    "scheduled + publishing must be part of the lifecycle",
  );
  assert(
    !(BOARD_FILTER_STATUSES as readonly string[]).includes("publishing"),
    "publishing is transient and must not be a board filter",
  );

  console.log("social_posts_unit.test.ts: all checks passed");
}

main();
