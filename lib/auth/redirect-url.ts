const LOCALHOST_ORIGIN = "http://localhost:3000";

function cleanOrigin(raw: string | undefined): string | null {
  const value = raw?.trim().replace(/\/+$/, "");
  if (!value) return null;
  if (!value.startsWith("http://") && !value.startsWith("https://")) return null;
  return value;
}

export function getAuthRedirectOrigin(): string {
  const configured = cleanOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return LOCALHOST_ORIGIN;
}

export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return fallback;
}

export function buildAuthCallbackUrl(nextPath: string): string {
  const origin = getAuthRedirectOrigin();
  const next = encodeURIComponent(safeNextPath(nextPath, "/onboarding"));
  return `${origin}/auth/callback?next=${next}`;
}
