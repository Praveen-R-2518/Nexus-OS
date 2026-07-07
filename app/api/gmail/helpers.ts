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
    !process.env.NEXT_PUBLIC_SITE_URL?.trim()
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

export function encodeOAuthState(state: OAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOAuthState(raw: string): OAuthState | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    const workspace_id = parsed.workspace_id;
    const team_id = parsed.team_id;
    const user_id = parsed.user_id;
    if (!isUuid(workspace_id) || !isUuid(team_id) || !isUuid(user_id)) {
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
