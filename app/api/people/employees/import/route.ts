import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import { importEmployeeCsv } from "@/lib/people/employee-csv";
import type { EmployeeErr } from "@/lib/people/employees";

export const dynamic = "force-dynamic";

function fromService(err: EmployeeErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:people:employees:import", 10, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.csv);
  if (!parsed.ok) return parsed.response;

  const result = await importEmployeeCsv(tenant, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json(result);
}
