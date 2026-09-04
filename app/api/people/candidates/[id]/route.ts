import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  getCandidate,
  updateCandidate,
  type CandidateErr,
} from "@/lib/people/candidates";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: CandidateErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function GET(request: Request, context: RouteContext) {
  const limited = rateLimit(request, "api:people:candidates:id:get", 120, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const id = context.params?.id ?? "";
  const result = await getCandidate(tenant, id);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const limited = rateLimit(request, "api:people:candidates:id:patch", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const id = context.params?.id ?? "";
  const result = await updateCandidate(tenant, id, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}
