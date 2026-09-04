import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import { getJob, updateJob, type JobErr } from "@/lib/people/jobs";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: JobErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function GET(request: Request, context: RouteContext) {
  const limited = rateLimit(request, "api:people:jobs:id:get", 120, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const id = context.params?.id ?? "";
  const result = await getJob(tenant, id);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const limited = rateLimit(request, "api:people:jobs:id:patch", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;

  const id = context.params?.id ?? "";
  const result = await updateJob(tenant, id, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}
