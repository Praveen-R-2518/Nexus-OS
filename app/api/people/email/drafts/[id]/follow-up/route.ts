import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import type { PeopleEmailErr } from "@/lib/people/email-drafts";
import {
  applyFollowUp,
  listFollowUpProposals,
} from "@/lib/people/email-follow-up";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: PeopleEmailErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function GET(request: Request, context: RouteContext) {
  const limited = rateLimit(
    request,
    "api:people:email:drafts:id:follow-up:get",
    60,
    60_000,
  );
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const id = context.params?.id ?? "";
  const result = await listFollowUpProposals(tenant, id);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}

export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimit(
    request,
    "api:people:email:drafts:id:follow-up:post",
    20,
    60_000,
  );
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const id = context.params?.id ?? "";
  const result = await applyFollowUp(tenant, id, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}
