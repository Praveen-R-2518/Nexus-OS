import { NextResponse } from "next/server";
import { rateLimit, requireApiTenantContext } from "@/lib/api-security";
import { getAiStatus } from "@/lib/ai/status";

export const dynamic = "force-dynamic";

/**
 * GET /api/ai/status — authenticated tenant readiness check for the dashboard. Returns
 * `{ configured, mock, features }` so the UI can show a disabled/degraded state instead of
 * silently failing when `OPENAI_API_KEY` is unset. See `hooks/useAiStatus.ts` for the client hook.
 */
export async function GET(request: Request) {
  const limited = rateLimit(request, "api:ai:status", 60, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  return NextResponse.json(getAiStatus());
}
