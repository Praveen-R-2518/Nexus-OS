import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  bulkUpdateCandidateJobStage,
  type CandidateJobErr,
} from "@/lib/people/candidate-jobs";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: CandidateJobErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimit(
    request,
    "api:people:jobs:id:candidates:stage:post",
    60,
    60_000,
  );
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const jobId = context.params?.id ?? "";
  const result = await bulkUpdateCandidateJobStage(tenant, jobId, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data, skipped: result.skipped });
}
