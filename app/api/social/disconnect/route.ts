import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiOrgContext,
} from "@/lib/api-security";
import { isSocialPlatform } from "@/app/api/social/helpers";

export const dynamic = "force-dynamic";

/** Disconnect a social publishing account (delete its credential row). */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:social:disconnect", 20, 60_000);
  if (limited) return limited;

  const org = await requireApiOrgContext();
  if (!org.ok) return org.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const platform = parsed.body.platform;
  if (!isSocialPlatform(platform)) return jsonError("Unknown platform", 400);

  const { error } = await org.supabase
    .from("social_credentials")
    .delete()
    .eq("organization_id", org.organizationId)
    .eq("platform", platform);
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ ok: true });
}
