import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  createEmployee,
  listEmployees,
  parseListQuery,
  type EmployeeErr,
} from "@/lib/people/employees";

export const dynamic = "force-dynamic";

function fromService(err: EmployeeErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:people:employees:get", 120, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const query = parseListQuery(new URL(request.url).searchParams);
  if (!query.ok) return fromService(query);

  const result = await listEmployees(tenant, query);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data, count: result.count });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:people:employees:post", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const result = await createEmployee(tenant, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data }, { status: 201 });
}
