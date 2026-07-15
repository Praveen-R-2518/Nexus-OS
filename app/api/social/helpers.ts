import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { appUrl } from "@/app/api/meta/helpers";
import { POST_PLATFORMS, type Platform } from "@/lib/posts/types";

/**
 * OAuth wiring for connecting social **publishing** accounts (social_credentials).
 * Distinct from the Meta messaging connect (meta_credentials): this stores per-org
 * tokens used by WF8b to publish. Each platform's provider app credentials come
 * from env — everything here works the moment those keys are set.
 */

export interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
  /** X requires PKCE (public client + code_verifier). */
  usesPkce: boolean;
}

/** Resolve a platform's OAuth config from env. Instagram/Facebook reuse the Meta app. */
export function providerConfig(platform: Platform): ProviderConfig | null {
  switch (platform) {
    case "instagram":
    case "facebook":
      return {
        authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
        scope:
          platform === "instagram"
            ? "instagram_basic,instagram_content_publish,pages_show_list"
            : "pages_manage_posts,pages_show_list,pages_read_engagement",
        clientId: process.env.META_APP_ID?.trim(),
        clientSecret: process.env.META_APP_SECRET?.trim(),
        usesPkce: false,
      };
    case "x":
      return {
        authorizeUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        scope: "tweet.read tweet.write users.read offline.access",
        clientId: process.env.X_CLIENT_ID?.trim(),
        clientSecret: process.env.X_CLIENT_SECRET?.trim(),
        usesPkce: true,
      };
    case "linkedin":
      return {
        authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scope: "w_member_social r_liteprofile",
        clientId: process.env.LINKEDIN_CLIENT_ID?.trim(),
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET?.trim(),
        usesPkce: false,
      };
    default:
      return null;
  }
}

export function isSocialPlatform(value: unknown): value is Platform {
  return typeof value === "string" && (POST_PLATFORMS as readonly string[]).includes(value);
}

/** True when the provider app credentials for this platform are configured. */
export function platformConfigured(platform: Platform): boolean {
  const cfg = providerConfig(platform);
  return !!cfg?.clientId && !!cfg?.clientSecret;
}

export function socialOAuthRedirectUri(): string {
  return `${appUrl()}/api/social/callback`;
}

// ---------------------------------------------------------------------------
// Signed OAuth state (CSRF binding + org/platform carry), mirrors meta helpers.
// ---------------------------------------------------------------------------

export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
export const PKCE_COOKIE = "social_pkce";

interface SocialOAuthState {
  organization_id: string;
  user_id: string;
  platform: Platform;
}

function stateHmacKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.trim() === "") {
    throw new Error("Missing ENCRYPTION_KEY environment variable");
  }
  return createHash("sha256").update(`social-oauth-state:${secret}`, "utf8").digest();
}

function sign(payloadB64: string): string {
  return createHmac("sha256", stateHmacKey()).update(payloadB64).digest("base64url");
}

export function encodeState(state: SocialOAuthState, iatMs = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...state, iat: iatMs })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeState(raw: string, nowMs = Date.now()): SocialOAuthState | null {
  try {
    const [payloadB64, sig] = raw.split(".");
    if (!payloadB64 || !sig) return null;
    const expected = sign(payloadB64);
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const { organization_id, user_id, platform, iat } = parsed;
    if (
      typeof organization_id !== "string" ||
      typeof user_id !== "string" ||
      !isSocialPlatform(platform) ||
      typeof iat !== "number" ||
      nowMs - iat > OAUTH_STATE_MAX_AGE_MS ||
      iat - nowMs > 60_000
    ) {
      return null;
    }
    return { organization_id, user_id, platform };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PKCE (X)
// ---------------------------------------------------------------------------

export function makePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
