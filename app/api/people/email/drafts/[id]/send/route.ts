import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  sendDraft,
  type PeopleEmailErr,
} from "@/lib/people/email-drafts";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

function fromService(err: PeopleEmailErr): NextResponse {
  return jsonError(err.error, err.status);
}

export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimit(
    request,
    "api:people:email:drafts:id:send:post",
    20,
    60_000,
  );
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.medium);
  if (!parsed.ok) return parsed.response;

  const id = context.params?.id ?? "";
  const result = await sendDraft(tenant, id, parsed.body);
  if (!result.ok) return fromService(result);

  return NextResponse.json({ data: result.data });
}
