import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/api-security";
import { createServerClient } from "@/lib/supabase";
import {
  markInboundEventsStatus,
  recordInboundEvents,
  setInboundEventsTenant,
} from "@/lib/inbound-events";
import { extractMetaRoute, resolveMetaTenant } from "@/lib/meta-tenant";
import { extractMessages, verifyMetaSignature } from "./parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ForwardOutcome = "forwarded" | "skipped" | "failed";

function n8nIntakeWebhookUrl(): string | null {
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/webhook/gmail-inbound`;
}

async function forwardToN8n(payload: unknown): Promise<ForwardOutcome> {
  const url = n8nIntakeWebhookUrl();
  if (!url) {
    console.warn("[meta/webhook] N8N_WEBHOOK_BASE_URL not set; leaving events for later retry");
    return "skipped";
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-nexus-channel": "meta",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[meta/webhook] n8n forward failed:", res.status, await res.text());
      return "failed";
    }
    return "forwarded";
  } catch (err) {
    console.error("[meta/webhook] n8n forward error:", err);
    return "failed";
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "api:meta:webhook:get", 30, 60_000);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (!verifyToken) {
    return NextResponse.json(
      { error: "Webhook verify token not configured" },
      { status: 503 },
    );
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:meta:webhook:post", 120, 60_000);
  if (limited) return limited;

  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret) {
    return NextResponse.json(
      { error: "Meta app secret not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = extractMessages(payload);
  if (messages.length === 0) {
    // No inbound message id (status/read receipts etc.) — nothing to dedup or process.
    return NextResponse.json({ status: "ignored" }, { status: 200 });
  }

  const supabase = createServerClient();

  // Persist the raw event BEFORE acking. Idempotent: re-delivery collides on
  // (platform, external_message_id) and is dropped.
  const results = await recordInboundEvents(
    supabase,
    messages.map((m) => ({
      platform: m.platform,
      externalMessageId: m.id,
      rawPayload: payload,
    })),
  );

  const persistFailed = results.filter((r) => r.error);
  if (persistFailed.length > 0) {
    // Could not durably persist — refuse to ack so Meta redelivers. Never silently drop.
    console.error(
      "[meta/webhook] failed to persist inbound events:",
      persistFailed.map((r) => r.error),
    );
    return NextResponse.json(
      { status: "error", error: "persist_failed" },
      { status: 503 },
    );
  }

  const newIds = results.filter((r) => r.inserted && r.id).map((r) => r.id as string);

  if (newIds.length === 0) {
    // Every message was a duplicate of an already-persisted event.
    return NextResponse.json({ status: "duplicate" }, { status: 200 });
  }

  // Resolve the owning tenant at the edge so the ledger is tenant-stamped and n8n never has to
  // re-derive routing. The conversation WRITE still happens in n8n; we only stamp + enrich here.
  const route = extractMetaRoute(payload);
  const tenant = await resolveMetaTenant(payload);

  if (!tenant) {
    // Unmatched routing key (or none). Durably store as `failed` for inspection, log a breadcrumb,
    // and do NOT forward — but still ack so Meta does not hammer us with redeliveries.
    await markInboundEventsStatus(supabase, newIds, "failed", "tenant_unresolved");
    return NextResponse.json(
      { status: "tenant_unresolved", recorded: newIds.length },
      { status: 200 },
    );
  }

  await setInboundEventsTenant(supabase, newIds, tenant.workspace_id, tenant.team_id);

  // Enrich the forward so the n8n normalizer consumes a pre-resolved tenant (its
  // `readVerifiedTenant` reads `_tenant.team_id`) instead of re-resolving it.
  const forwardBody = {
    ...(payload as Record<string, unknown>),
    _tenant: {
      team_id: tenant.team_id,
      workspace_id: tenant.workspace_id ?? undefined,
      route_source: tenant.platform,
      route_key: route?.routingKey ?? "",
    },
  };

  // Persisted. Hand off to n8n — awaited and failure-tolerant. On any failure the rows stay
  // `received` so a retry sweep can re-forward; the event is never thrown away.
  const outcome = await forwardToN8n(forwardBody);

  if (outcome === "forwarded") {
    await markInboundEventsStatus(supabase, newIds, "processing");
  } else {
    await markInboundEventsStatus(
      supabase,
      newIds,
      "received",
      outcome === "skipped" ? "n8n not configured" : "n8n forward failed",
    );
    if (outcome === "skipped") {
      console.warn(
        "[meta/webhook] N8N_WEBHOOK_BASE_URL not configured; events left for later retry",
      );
    } else {
      console.error("[meta/webhook] n8n forward failed; events left for later retry");
    }
  }

  return NextResponse.json(
    { status: "received", recorded: newIds.length },
    { status: 200 },
  );
}
