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
  if (!tenant.ok) {
    // #region agent log
    fetch("http://127.0.0.1:7718/ingest/82f32985-4bff-4337-b714-72c7f9526288", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "23c246" },
      body: JSON.stringify({
        sessionId: "23c246",
        runId: "post-fix",
        hypothesisId: "E",
        location: "app/api/ai/status/route.ts:GET",
        message: "AI status tenant auth failed",
        data: { status: tenant.response.status },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return tenant.response;
  }

  const status = getAiStatus();
  // #region agent log
  fetch("http://127.0.0.1:7718/ingest/82f32985-4bff-4337-b714-72c7f9526288", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "23c246" },
    body: JSON.stringify({
      sessionId: "23c246",
      runId: "post-fix",
      hypothesisId: "A,B,C,D",
      location: "app/api/ai/status/route.ts:GET",
      message: "AI status response",
      data: { configured: status.configured, mock: status.mock, features: status.features },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return NextResponse.json(status);
}
