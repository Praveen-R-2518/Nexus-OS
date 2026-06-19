import { NextResponse } from "next/server";
import { rateLimit, requireApiTenantContext } from "@/lib/api-security";
import {
  encodeOAuthState,
  isMetaPlatform,
  metaConfigError,
  metaOAuthRedirectUri,
  META_SCOPES,
} from "@/app/api/meta/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:meta:connect", 10, 60_000);
  if (limited) return limited;

  if (metaConfigError()) {
    return NextResponse.json(
      { error: "Meta OAuth is not configured" },
      { status: 500 },
    );
  }

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  if (!tenant.workspaceId) {
    return NextResponse.json(
      { error: "Complete workspace setup" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const requestedWsId = searchParams.get("workspace_id")?.trim();
  const platformParam = searchParams.get("platform")?.trim();

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

  const clientId = process.env.META_APP_ID!.trim();
  const state = encodeOAuthState({
    workspace_id: workspaceId,
    team_id: tenant.teamId,
    user_id: tenant.user.id,
    ...(isMetaPlatform(platformParam) ? { platform: platformParam } : {}),
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: metaOAuthRedirectUri(),
    response_type: "code",
    scope: META_SCOPES,
    state,
  });

  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}
