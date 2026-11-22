import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  cancelProposedAction,
  confirmProposedAction,
  isChatActionDecision,
  type PeopleProposeErr,
} from "@/lib/chat/people-propose";
import { CHAT_ACTION_DECISIONS } from "@/types";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: PeopleProposeErr): NextResponse {
  return jsonError(err.error, err.status);
}

/**
 * POST /api/chat/actions/[id]
 * Body { decision: "confirm" | "cancel" }. Kind/payload from the stored row only.
 */
export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimit(request, "api:chat:actions:id:post", 20, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const extra = Object.keys(parsed.body).filter((key) => key !== "decision");
  if (extra.length > 0) {
    return jsonError(`Unexpected fields: ${extra.join(", ")}`, 400);
  }

  if (!isChatActionDecision(parsed.body.decision)) {
    return jsonError(
      `decision must be one of: ${CHAT_ACTION_DECISIONS.join(", ")}`,
      400,
    );
  }

  const ctx = {
    supabase: tenant.supabase,
    teamId: tenant.teamId,
    workspaceId: tenant.workspaceId,
    user: { id: tenant.user.id },
    sessionId: "",
  };
  const id = context.params?.id ?? "";

  switch (parsed.body.decision) {
    case "confirm": {
      const result = await confirmProposedAction(ctx, id);
      if (!result.ok) return fromService(result);
      return NextResponse.json({ data: result.data, skipped: result.skipped });
    }
    case "cancel": {
      const result = await cancelProposedAction(ctx, id);
      if (!result.ok) return fromService(result);
      return NextResponse.json({ data: result.data });
    }
    default: {
      const _never: never = parsed.body.decision;
      return jsonError(`Unsupported decision: ${String(_never)}`, 400);
    }
  }
}
