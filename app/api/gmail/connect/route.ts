import { NextResponse } from "next/server";
import { rateLimit, requireApiTenantContext } from "@/lib/api-security";
import {
  appUrl,
  encodeOAuthState,
  GMAIL_SCOPES,
  oauthConfigError,
  oauthRedirectUri,
} from "@/app/api/gmail/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:gmail:connect", 10, 60_000);
  if (limited) return limited;

  if (oauthConfigError()) {
    return NextResponse.json(
      { error: "Gmail OAuth is not configured" },
      { status: 500 },
    );
  }

  // Google always redirects back to NEXT_PUBLIC_SITE_URL's host. Starting the
  // flow from a different host (e.g. localhost against a prod-configured env)
  // strands the callback on the other host with no session — make that loud.
  try {
    const requestHost = new URL(request.url).host;
    const configuredHost = new URL(appUrl()).host;
    if (requestHost !== configuredHost) {
      console.warn(
        "[gmail.connect] host mismatch: request from",
        requestHost,
        "but OAuth callback will land on",
        configuredHost,
        "- the signup tab on this host will not see the redirect",
      );
    }
  } catch {
    // appUrl() unset/invalid is already covered by oauthConfigError()
  }

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  if (!tenant.workspaceId) {
    return NextResponse.json(
      { error: "Complete workspace setup" },
      { status: 403 },
    );
  }

  const requestedWsId = new URL(request.url).searchParams
    .get("workspace_id")
    ?.trim();

  let workspaceId = tenant.workspaceId;

  if (requestedWsId) {
    const { data: workspace, error: wsErr } = await tenant.supabase
      .from("workspaces")
      .select("id, owner_user_id, team_id")
      .eq("id", requestedWsId)
      .maybeSingle();

    if (
      wsErr ||
      !workspace ||
      workspace.team_id !== tenant.teamId ||
      workspace.owner_user_id !== tenant.user.id
    ) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 403 },
      );
    }

    workspaceId = requestedWsId;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const state = encodeOAuthState({
    workspace_id: workspaceId,
    team_id: tenant.teamId,
    user_id: tenant.user.id,
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: oauthRedirectUri(),
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
