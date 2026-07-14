import { createServerClient } from "../lib/supabase";
import { upsertSocialCredential } from "../lib/social/credentials";

const ORG = process.env.SEED_ORG_ID ?? "6d265fe4-97f8-4556-822f-08833303787b";

async function main() {
  const supabase = createServerClient();
  const result = await upsertSocialCredential(supabase, {
    organizationId: ORG,
    platform: "instagram",
    accessToken: "dry-run-access-token",
    refreshToken: "dry-run-refresh-token",
    tokenExpiresAt: "2026-12-31T00:00:00.000Z",
  });

  if (!result.ok) {
    console.error("SEED_FAILED", result.error);
    process.exit(1);
  }

  console.log("SEED_OK", { organizationId: ORG, platform: "instagram" });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
