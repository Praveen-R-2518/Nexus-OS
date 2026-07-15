import { NextResponse } from "next/server";
import { rateLimit, requireApiOrgContext } from "@/lib/api-security";
import { upsertSocialCredential } from "@/lib/social/credentials";
import {
  decodeState,
  PKCE_COOKIE,
  providerConfig,
  socialOAuthRedirectUri,
} from "@/app/api/social/helpers";
import { appUrl } from "@/app/api/meta/helpers";
import type { Platform } from "@/lib/posts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function settingsRedirect(status: "connected" | "error", platform?: string): NextResponse {
  const base = appUrl() || "";
  const q = new URLSearchParams({ social: status, ...(platform ? { platform } : {}) });
  return NextResponse.redirect(`${base}/settings?${q.toString()}#social-posting`);
}

interface TokenResult {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

/** Exchange the authorization code for tokens, per provider. */
async function exchangeCode(
  platform: Platform,
  code: string,
  verifier: string | null,
): Promise<TokenResult | null> {
  const cfg = providerConfig(platform);
  if (!cfg?.clientId || !cfg.clientSecret) return null;
  const redirectUri = socialOAuthRedirectUri();

  let res: Response;
  if (platform === "instagram" || platform === "facebook") {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      code,
    });
    res = await fetch(`${cfg.tokenUrl}?${params.toString()}`, { method: "GET" });
  } else if (platform === "x") {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      ...(verifier ? { code_verifier: verifier } : {}),
    });
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${basic}`,
      },
      body,
    });
  } else {
    // linkedin
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  }

  if (!res.ok) {
    console.error(`[social/callback] ${platform} token exchange failed: ${res.status}`);
    return null;
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) return null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt:
      typeof json.expires_in === "number"
        ? new Date(Date.now() + json.expires_in * 1000).toISOString()
        : null,
  };
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:social:callback", 20, 60_000);
  if (limited) return limited;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  if (!code || !rawState) return settingsRedirect("error");

  const state = decodeState(rawState);
  if (!state) return settingsRedirect("error");

  // Bind the callback to the logged-in owner of the state's org.
  const org = await requireApiOrgContext();
  if (!org.ok || org.organizationId !== state.organization_id) {
    return settingsRedirect("error", state.platform);
  }

  const verifier =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${PKCE_COOKIE}_${state.platform}=`))
      ?.split("=")[1] ?? null;

  const tokens = await exchangeCode(state.platform, code, verifier);
  if (!tokens) return settingsRedirect("error", state.platform);

  const result = await upsertSocialCredential(org.supabase, {
    organizationId: org.organizationId,
    platform: state.platform,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
  });
  if (!result.ok) return settingsRedirect("error", state.platform);

  const redirect = settingsRedirect("connected", state.platform);
  redirect.cookies.delete(`${PKCE_COOKIE}_${state.platform}`);
  return redirect;
}
