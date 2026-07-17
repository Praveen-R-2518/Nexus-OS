import { NextResponse } from "next/server";
import { jsonError, rateLimit, requireApiOrgContext } from "@/lib/api-security";
import {
  encodeState,
  isSocialPlatform,
  makePkce,
  PKCE_COOKIE,
  platformConfigured,
  providerConfig,
  socialOAuthRedirectUri,
} from "@/app/api/social/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start the OAuth flow to connect a social publishing account. Org id is derived
 * server-side. Redirects to the provider's consent screen; the callback stores the
 * encrypted tokens. Returns an honest error when the provider app keys are unset.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, "api:social:connect", 10, 60_000);
  if (limited) return limited;

  const org = await requireApiOrgContext();
  if (!org.ok) return org.response;

  const platform = new URL(request.url).searchParams.get("platform");
  if (!isSocialPlatform(platform)) {
    return jsonError("Unknown platform", 400);
  }
  if (!platformConfigured(platform)) {
    return jsonError(
      `${platform} publishing is not configured yet — add its API credentials.`,
      503,
    );
  }

  const cfg = providerConfig(platform)!;
  const state = encodeState({
    organization_id: org.organizationId,
    user_id: org.user.id,
    platform,
  });

  const params = new URLSearchParams({
    client_id: cfg.clientId!,
    redirect_uri: socialOAuthRedirectUri(),
    response_type: "code",
    scope: cfg.scope,
    state,
  });

  const res = NextResponse.redirect(`${cfg.authorizeUrl}?${params.toString()}`);

  if (cfg.usesPkce) {
    const { verifier, challenge } = makePkce();
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
    // Rebuild the redirect with the challenge, and stash the verifier httpOnly.
    const withPkce = NextResponse.redirect(`${cfg.authorizeUrl}?${params.toString()}`);
    withPkce.cookies.set(`${PKCE_COOKIE}_${platform}`, verifier, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/api/social",
    });
    return withPkce;
  }

  return res;
}
