import { createHash, createHmac, timingSafeEqual } from "crypto";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function oauthConfigError(): boolean {
  return (
    !process.env.GOOGLE_CLIENT_ID?.trim() ||
    !process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    !process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    // The state token is HMAC-signed with ENCRYPTION_KEY, so OAuth cannot run without it.
    !process.env.ENCRYPTION_KEY?.trim()
  );
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
}

export function oauthRedirectUri(): string {
  return `${appUrl()}/api/gmail/callback`;
}

export function signupGmailUrl(params: Record<string, string>): string {
  const q = new URLSearchParams({ step: "gmail", ...params });
  return `/signup?${q.toString()}`;
}

export type OAuthState = {
  workspace_id: string;
  team_id: string;
  user_id: string;
};

/**
 * The callback must be able to trust the state WITHOUT a session cookie
 * (Safari ITP drops it on the Google → app redirect), so the state carries an
 * HMAC signature and an issued-at timestamp instead of relying on the session.
 */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function stateHmacKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.trim() === "") {
    throw new Error("Missing ENCRYPTION_KEY environment variable");
  }
  // Domain-separated from the AES key derivation in lib/encryption.
  return createHash("sha256")
    .update(`gmail-oauth-state:${secret}`, "utf8")
    .digest();
}

function signPayload(payloadB64: string): string {
  return createHmac("sha256", stateHmacKey())
    .update(payloadB64)
    .digest("base64url");
}

export function encodeOAuthState(
  state: OAuthState,
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
): OAuthState | null {
  try {
    const [payloadB64, sig] = raw.split(".");
    if (!payloadB64 || !sig) return null;

    const expected = signPayload(payloadB64);
    const sigBuf = Buffer.from(sig, "base64url");
    const expectedBuf = Buffer.from(expected, "base64url");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
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
    return {
      workspace_id: workspace_id.trim(),
      team_id: team_id.trim(),
      user_id: user_id.trim(),
    };
  } catch {
    return null;
  }
}
