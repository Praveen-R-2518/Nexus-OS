import { NextResponse } from "next/server";
import { jsonError, rateLimit, requireApiTenantContext } from "@/lib/api-security";
import { exportEmployeesCsv } from "@/lib/people/employee-csv";
import type { EmployeeErr } from "@/lib/people/employees";

export const dynamic = "force-dynamic";

function fromService(err: EmployeeErr): NextResponse {
  return jsonError(err.error, err.status);
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^\w.-]+/g, "_");
  return `attachment; filename="${safe}"`;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:people:employees:export", 30, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const result = await exportEmployeesCsv(tenant);
  if (!result.ok) return fromService(result);

  return new NextResponse(result.csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": contentDisposition(result.filename),
      "Cache-Control": "no-store",
    },
  });
}
