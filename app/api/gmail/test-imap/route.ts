import { NextResponse } from "next/server";
import Imap from "imap";
import nodemailer from "nodemailer";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
} from "@/lib/api-security";
import { encryptSecret, isEncryptionConfigured } from "@/lib/encryption/credential-secret";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Legacy Gmail-only defaults: an omitted host/port/tls keeps this route's original behavior (used by
// the signup "skip" path and any Gmail-flavoured caller) while new callers pass any provider's host.
const DEFAULT_IMAP_HOST = "imap.gmail.com";
const DEFAULT_IMAP_PORT = 993;

type MailboxSettings = {
  host: string;
  port: number;
  tls: boolean;
};

type Body = {
  workspace_id?: string;
  email?: string;
  username?: string;
  password?: string;
  skip?: boolean;
  imap_host?: string;
  imap_port?: number;
  imap_tls?: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_tls?: boolean;
};

/** Read an optional generic-mailbox IMAP config from the body; falls back to Gmail defaults. */
function readImapSettings(body: Body): MailboxSettings {
  const host =
    typeof body.imap_host === "string" && body.imap_host.trim()
      ? body.imap_host.trim()
      : DEFAULT_IMAP_HOST;
  const port =
    typeof body.imap_port === "number" && Number.isFinite(body.imap_port)
      ? Math.trunc(body.imap_port)
      : DEFAULT_IMAP_PORT;
  const tls = typeof body.imap_tls === "boolean" ? body.imap_tls : true;
  return { host, port, tls };
}

/** Read an optional SMTP config from the body. Returns null when no smtp_host is provided. */
function readSmtpSettings(body: Body): MailboxSettings | null {
  if (typeof body.smtp_host !== "string" || !body.smtp_host.trim()) return null;
  const host = body.smtp_host.trim();
  const port =
    typeof body.smtp_port === "number" && Number.isFinite(body.smtp_port)
      ? Math.trunc(body.smtp_port)
      : 587;
  const tls = typeof body.smtp_tls === "boolean" ? body.smtp_tls : port === 465;
  return { host, port, tls };
}

function testImap(
  user: string,
  password: string,
  settings: MailboxSettings,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user,
      password,
      host: settings.host,
      port: settings.port,
      tls: settings.tls,
      tlsOptions: { servername: settings.host },
      connTimeout: 12_000,
      authTimeout: 12_000,
    });

    const timer = setTimeout(() => {
      try {
        imap.end();
      } catch {
        // ignore
      }
      reject(new Error("IMAP connection timed out"));
    }, 12_000);

    imap.once("ready", () => {
      clearTimeout(timer);
      try {
        imap.end();
      } catch {
        // ignore
      }
      resolve();
    });

    imap.once("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    try {
      imap.connect();
    } catch (e) {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Verify the mailbox can authenticate for SMTP send before we save it (nodemailer.verify). */
async function testSmtp(
  user: string,
  password: string,
  settings: MailboxSettings,
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.tls,
    auth: { user, pass: password },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 12_000,
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "api:gmail:test-imap", 8, 60_000);
  if (limited) return limited;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as Body;

  const workspaceId =
    typeof body.workspace_id === "string" ? body.workspace_id.trim() : "";
  if (!workspaceId) {
    return NextResponse.json(
      { success: false, error: "workspace_id is required" },
      { status: 400 },
    );
  }

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Server encryption is not configured. Add ENCRYPTION_KEY to your server environment (e.g. .env.local for local dev), restart the dev server, then try again.",
      },
      { status: 500 },
    );
  }

  let supabase;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server configuration error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: workspace, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, owner_user_id")
    .eq("id", workspaceId)
    .maybeSingle();

  if (wsErr || !workspace || workspace.owner_user_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "Workspace not found" },
      { status: 403 },
    );
  }

  if (body.skip) {
    try {
      const email =
        typeof body.email === "string" && body.email.trim()
          ? body.email.trim()
          : user.email ?? "";
      const username =
        typeof body.username === "string" && body.username.trim()
          ? body.username.trim()
          : email;
      if (!email) {
        return NextResponse.json(
          { success: false, error: "Email is required to skip for now" },
          { status: 400 },
        );
      }
      const encrypted = encryptSecret("PENDING_PLACEHOLDER");
      await supabase.from("gmail_credentials").delete().eq("workspace_id", workspaceId);
      const { error: insErr } = await supabase.from("gmail_credentials").insert({
        workspace_id: workspaceId,
        email_address: email,
        imap_username: username,
        imap_password_encrypted: encrypted,
        credential_type: "imap",
        status: "pending",
        last_verified_at: null,
      });
      if (insErr) {
        return NextResponse.json(
          { success: false, error: insErr.message },
          { status: 500 },
        );
      }
      return NextResponse.json({ success: true, skipped: true });
    } catch (e) {
      const msg =
        e instanceof Error && e.message.includes("ENCRYPTION_KEY")
          ? "Server encryption is not configured"
          : "Encryption error";
      return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !username || !password) {
    return NextResponse.json(
      { success: false, error: "email, username, and password are required" },
      { status: 400 },
    );
  }

  const imapSettings = readImapSettings(body);
  const smtpSettings = readSmtpSettings(body);

  try {
    await testImap(username, password, imapSettings);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid credentials or IMAP not enabled",
      },
      { status: 400 },
    );
  }

  // When the caller supplies SMTP settings (any generic provider), verify send auth too so the UI
  // can never save a mailbox that receives but cannot reply.
  if (smtpSettings) {
    try {
      await testSmtp(username, password, smtpSettings);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: "IMAP works, but the SMTP settings were rejected. Check the SMTP host/port/TLS.",
        },
        { status: 400 },
      );
    }
  }

  let encryptedPayload: string;
  try {
    encryptedPayload = encryptSecret(password);
  } catch (e) {
    const msg =
      e instanceof Error && e.message.includes("ENCRYPTION_KEY")
        ? "Server encryption is not configured"
        : "Encryption error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }

  const now = new Date().toISOString();
  await supabase.from("gmail_credentials").delete().eq("workspace_id", workspaceId);
  // SMTP reuses imap_password_encrypted (single account password is the provider norm), so no
  // smtp_password_encrypted is written here. Host columns stay null on the legacy Gmail-only call
  // (no imap_host/smtp_host in the body) so the mailbox poller ignores those rows.
  const { error: insErr } = await supabase.from("gmail_credentials").insert({
    workspace_id: workspaceId,
    email_address: email,
    imap_username: username,
    imap_password_encrypted: encryptedPayload,
    credential_type: "imap",
    status: "connected",
    last_verified_at: now,
    imap_host: body.imap_host?.trim() || null,
    imap_port: imapSettings.port,
    imap_tls: imapSettings.tls,
    smtp_host: smtpSettings?.host ?? null,
    smtp_port: smtpSettings?.port ?? null,
    smtp_tls: smtpSettings?.tls ?? true,
  });

  if (insErr) {
    return NextResponse.json({ success: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
