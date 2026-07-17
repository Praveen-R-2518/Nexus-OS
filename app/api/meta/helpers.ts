import { createHash, createHmac, timingSafeEqual } from "crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const META_GRAPH_VERSION = "v21.0";

export const META_PLATFORMS = ["whatsapp", "instagram", "facebook"] as const;
export type MetaPlatform = (typeof META_PLATFORMS)[number];

/** Scopes for WhatsApp + Instagram + Facebook Messenger via one Meta app. */
export const META_SCOPES = [
  "whatsapp_business_messaging",
  "instagram_basic",
  "instagram_business_manage_messages",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_show_list",
  "business_management",
].join(",");

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function metaConfigError(): boolean {
  return (
    !process.env.META_APP_ID?.trim() ||
    !process.env.META_APP_SECRET?.trim() ||
    !process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    // The OAuth state is HMAC-signed with ENCRYPTION_KEY, so the flow cannot
    // run without it (mirrors the Gmail OAuth precondition).
    !process.env.ENCRYPTION_KEY?.trim()
  );
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
}

export function metaOAuthRedirectUri(): string {
  return `${appUrl()}/api/meta/callback`;
}

/**
 * Task D.3: Meta OAuth always lands back on `/profile` (the Settings destination) with its
 * status params preserved — NOT `/dashboard`/`/settings`, which would either drop the params or
 * bounce through an extra redirect. `section=channels` lets `/profile` scroll to the right card.
 */
export function metaDashboardUrl(params: Record<string, string>): string {
  const q = new URLSearchParams({ section: "channels", ...params });
  return `/profile?${q.toString()}`;
}

export type MetaOAuthState = {
  workspace_id: string;
  team_id: string;
  user_id: string;
  platform?: MetaPlatform;
};

/**
 * The callback must be able to trust the state WITHOUT relying solely on the
 * browser session, so the state carries an HMAC signature and an issued-at
 * timestamp (defense-in-depth + CSRF binding). Mirrors app/api/gmail/helpers.ts.
 */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function stateHmacKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.trim() === "") {
    throw new Error("Missing ENCRYPTION_KEY environment variable");
  }
  // Domain-separated from the Gmail OAuth-state key and the AES key derivation.
  return createHash("sha256")
    .update(`meta-oauth-state:${secret}`, "utf8")
    .digest();
}

function signPayload(payloadB64: string): string {
  return createHmac("sha256", stateHmacKey())
    .update(payloadB64)
    .digest("base64url");
}

export function encodeOAuthState(
  state: MetaOAuthState,
  iatMs: number = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({ ...state, iat: iatMs }),
  ).toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function decodeOAuthState(
  raw: string,
  nowMs: number = Date.now(),
): MetaOAuthState | null {
  try {
    const [payloadB64, sig] = raw.split(".");
    if (!payloadB64 || !sig) return null;

    const expected = signPayload(payloadB64);
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    if (
      sigBuf.length !== expectedBuf.length ||
      !timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }

    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const workspace_id = parsed.workspace_id;
    const team_id = parsed.team_id;
    const user_id = parsed.user_id;
    const iat = parsed.iat;
    if (!isUuid(workspace_id) || !isUuid(team_id) || !isUuid(user_id)) {
      return null;
    }
    // Reject stale states and (clock-skew tolerant) future-dated ones.
    if (
      typeof iat !== "number" ||
      nowMs - iat > OAUTH_STATE_MAX_AGE_MS ||
      iat - nowMs > 60_000
    ) {
      return null;
    }
    const platform = parsed.platform;
    const out: MetaOAuthState = {
      workspace_id: workspace_id.trim(),
      team_id: team_id.trim(),
      user_id: user_id.trim(),
    };
    if (
      typeof platform === "string" &&
      (META_PLATFORMS as readonly string[]).includes(platform)
    ) {
      out.platform = platform as MetaPlatform;
    }
    return out;
  } catch {
    return null;
  }
}

export function metaGraphUrl(path: string, params?: Record<string, string>): string {
  const base = `https://graph.facebook.com/${META_GRAPH_VERSION}${path.startsWith("/") ? path : `/${path}`}`;
  if (!params || Object.keys(params).length === 0) return base;
  return `${base}?${new URLSearchParams(params).toString()}`;
}

export function isMetaPlatform(value: unknown): value is MetaPlatform {
  return (
    typeof value === "string" &&
    (META_PLATFORMS as readonly string[]).includes(value)
  );
}
