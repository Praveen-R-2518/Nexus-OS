import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  generateDraft,
  type PeopleEmailErr,
} from "@/lib/people/email-drafts";

export const dynamic = "force-dynamic";

function fromService(err: PeopleEmailErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function POST(request: Request) {
  const limited = rateLimit(
    request,
    "api:people:email:drafts:post",
    20,
    60_000,
  );
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;

  const result = await generateDraft(tenant, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data }, { status: 201 });
}
