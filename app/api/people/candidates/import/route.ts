import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import { importCandidateCsv } from "@/lib/people/candidate-csv";
import type { CandidateErr } from "@/lib/people/candidates";

export const dynamic = "force-dynamic";

function fromService(err: CandidateErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:people:candidates:import", 10, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.csv);
  if (!parsed.ok) return parsed.response;

  const result = await importCandidateCsv(tenant, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json(result);
}
