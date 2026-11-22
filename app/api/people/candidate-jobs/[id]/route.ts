import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  patchCandidateJob,
  type CandidateJobErr,
} from "@/lib/people/candidate-jobs";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: CandidateJobErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function PATCH(request: Request, context: RouteContext) {
  const limited = rateLimit(
    request,
    "api:people:candidate-jobs:id:patch",
    60,
    60_000,
  );
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const id = context.params?.id ?? "";
  const result = await patchCandidateJob(tenant, id, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}
