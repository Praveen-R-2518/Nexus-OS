/**
 * Focused checks for the Post unit's tenant-safe helpers:
 *  - storage paths are always prefixed with the org id (required by the
 *    storage.objects RLS policy) and keep a sane extension
 *  - the not-yet-built AI helpers reject with PostFeatureUnavailableError so
 *    the UI shows "Not available yet" instead of hitting a guessed URL
 *
 * Run: tsx scripts/social_posts_unit.test.ts
 */

import { buildStoragePath } from "../lib/posts/data";
import {
  PostFeatureUnavailableError,
  enhanceCaptionStub,
  visionCaptionStub,
} from "../lib/posts/webhooks";

function assert(cond: unknown, msg?: string): void {
  if (!cond) throw new Error(msg || "assertion failed");
}

const ORG = "9f1c1b2a-0000-4000-8000-abcabcabcabc";

async function expectUnavailable(fn: () => Promise<unknown>, label: string) {
  try {
    await fn();
  } catch (e) {
    assert(
      e instanceof PostFeatureUnavailableError,
      `${label} should throw PostFeatureUnavailableError`,
    );
    return;
  }
  throw new Error(`${label} should have thrown`);
}

async function main() {
// --- buildStoragePath -------------------------------------------------------
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

// first path segment (the RLS folder) must equal the org id exactly
assert(p1.split("/")[0] === ORG, "folder segment must be the org id");

// --- stubbed AI helpers -----------------------------------------------------
await expectUnavailable(
  () => visionCaptionStub({ orgId: ORG, mediaUrl: `${ORG}/x.png` }),
  "visionCaptionStub",
);
await expectUnavailable(
  () => enhanceCaptionStub({ orgId: ORG, existingCaption: "hi" }),
  "enhanceCaptionStub",
);

console.log("social_posts_unit.test.ts: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
