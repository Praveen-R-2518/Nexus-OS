import { NextResponse } from "next/server";
import {
  jsonError,
  rateLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  listJobCandidates,
  parseListJobCandidatesQuery,
  type CandidateJobErr,
} from "@/lib/people/candidate-jobs";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: CandidateJobErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function GET(request: Request, context: RouteContext) {
  const limited = rateLimit(
    request,
    "api:people:jobs:id:candidates:get",
    120,
    60_000,
  );
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const jobId = context.params?.id ?? "";
  const url = new URL(request.url);
  const query = parseListJobCandidatesQuery(url.searchParams);
  if (!query.ok) return fromService(query);

  const result = await listJobCandidates(tenant, jobId, query);
  if (!result.ok) return fromService(result);

  return NextResponse.json({
    data: result.data,
    count: result.count,
    stage_counts: result.stage_counts,
    assignees: result.assignees,
  });
}
