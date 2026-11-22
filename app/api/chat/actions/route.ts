import { NextResponse } from "next/server";
import {
  jsonError,
  rateLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  listProposedActions,
  type PeopleProposeErr,
} from "@/lib/chat/people-propose";

export const dynamic = "force-dynamic";

function fromService(err: PeopleProposeErr): NextResponse {
  return jsonError(err.error, err.status);
}

/**
 * GET /api/chat/actions?session_id=<uuid>
 * Tenant-scoped confirmation cards for one chat session.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, "api:chat:actions:get", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id")?.trim() || "";
  if (!sessionId) return jsonError("session_id is required", 400);

  const result = await listProposedActions({
    supabase: tenant.supabase,
    teamId: tenant.teamId,
    workspaceId: tenant.workspaceId,
    user: { id: tenant.user.id },
    sessionId,
  });
  if (!result.ok) return fromService(result);

  return NextResponse.json({ actions: result.data });
}
