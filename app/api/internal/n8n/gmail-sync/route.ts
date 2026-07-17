import { NextResponse } from "next/server";
import { rateLimit, requireN8nBootstrapToken } from "@/lib/api-security";
import { runGmailSync } from "@/app/api/internal/n8n/gmail-sync/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Scheduler poll — no job exists yet, so this is bootstrap-token-only (see docs/n8n_workspace_env.md). */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:gmail-sync", 30, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  const result = await runGmailSync();
  return NextResponse.json(result.body, { status: result.status });
}
