import { NextResponse } from "next/server";
import { jsonError, rateLimit, requireApiTenantContext } from "@/lib/api-security";
import { exportCandidatesCsv } from "@/lib/people/candidate-csv";
import type { CandidateErr } from "@/lib/people/candidates";

export const dynamic = "force-dynamic";

function fromService(err: CandidateErr): NextResponse {
  return jsonError(err.error, err.status);
}

function contentDisposition(filename: string): string {
  const safe = filename.replace(/[^\w.-]+/g, "_");
  return `attachment; filename="${safe}"`;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:people:candidates:export", 30, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const result = await exportCandidatesCsv(tenant);
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
