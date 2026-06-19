import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
const seenMessageIds = new Map<string, number>();

function pruneDedupeStore(now: number) {
  for (const [key, expiresAt] of seenMessageIds) {
    if (expiresAt <= now) seenMessageIds.delete(key);
  }
}

function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

function extractMessageIds(payload: unknown): string[] {
  const ids: string[] = [];
  if (!payload || typeof payload !== "object") return ids;
  const root = payload as Record<string, unknown>;
  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const changes = Array.isArray(e.changes) ? e.changes : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value;
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      const messages = Array.isArray(v.messages) ? v.messages : [];
      for (const msg of messages) {
        if (msg && typeof msg === "object" && (msg as Record<string, unknown>).id) {
          ids.push(String((msg as Record<string, unknown>).id));
        }
      }
    }

    const messaging = Array.isArray(e.messaging) ? e.messaging : [];
    for (const evt of messaging) {
      if (!evt || typeof evt !== "object") continue;
      const m = evt as Record<string, unknown>;
      const message = m.message;
      if (message && typeof message === "object" && (message as Record<string, unknown>).mid) {
        ids.push(String((message as Record<string, unknown>).mid));
      }
    }
  }

  return ids;
}

function isDuplicateMessage(ids: string[]): boolean {
  const now = Date.now();
  pruneDedupeStore(now);
  for (const id of ids) {
    const key = `meta:${id}`;
    if (seenMessageIds.has(key)) return true;
  }
  for (const id of ids) {
    seenMessageIds.set(`meta:${id}`, now + DEDUPE_TTL_MS);
  }
  return false;
}

function n8nIntakeWebhookUrl(): string | null {
  const base = process.env.N8N_WEBHOOK_BASE_URL?.trim()?.replace(/\/$/, "");
  if (!base) return null;
  return `${base}/webhook/gmail-inbound`;
}

async function forwardToN8n(payload: unknown): Promise<void> {
  const url = n8nIntakeWebhookUrl();
  if (!url) {
    console.warn("[meta/webhook] N8N_WEBHOOK_BASE_URL not set; skipping forward");
    return;
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
    }
  } catch (err) {
    console.error("[meta/webhook] n8n forward error:", err);
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

  const messageIds = extractMessageIds(payload);
  if (messageIds.length > 0 && isDuplicateMessage(messageIds)) {
    return NextResponse.json({ status: "duplicate" }, { status: 200 });
  }

  void forwardToN8n(payload);

  return NextResponse.json({ status: "received" }, { status: 200 });
}
