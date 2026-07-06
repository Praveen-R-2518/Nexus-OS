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
    !process.env.NEXT_PUBLIC_SITE_URL?.trim()
  );
}

export function appUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
}

export function metaOAuthRedirectUri(): string {
  return `${appUrl()}/api/meta/callback`;
}

export function metaDashboardUrl(params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  return `/dashboard?${q.toString()}`;
}

export type MetaOAuthState = {
  workspace_id: string;
  team_id: string;
  user_id: string;
  platform?: MetaPlatform;
};

export function encodeOAuthState(state: MetaOAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOAuthState(raw: string): MetaOAuthState | null {
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
