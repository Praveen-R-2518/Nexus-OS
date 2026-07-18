import { NextResponse } from "next/server";
import { rateLimit, requireN8nBootstrapToken } from "@/lib/api-security";
import { runMailboxSync } from "@/lib/mailbox/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generic-mailbox (IMAP) scheduler poll — the any-provider sibling of `/api/internal/n8n/gmail-sync`.
 * No per-tenant job exists yet, so this is bootstrap-token-only (see docs/n8n_workspace_env.md).
 * Intended to be hit by an n8n schedule workflow on a ~10-minute cadence.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:internal:n8n:mailbox-sync", 30, 60_000);
  if (limited) return limited;

  const unauthorized = requireN8nBootstrapToken(request);
  if (unauthorized) return unauthorized;

  const result = await runMailboxSync();
  return NextResponse.json(result.body, { status: result.status });
}
