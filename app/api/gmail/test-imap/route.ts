import { NextResponse } from "next/server";
import Imap from "imap";
import { encryptSecret, isEncryptionConfigured } from "@/lib/encryption/credential-secret";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  workspace_id?: string;
  email?: string;
  username?: string;
  password?: string;
  skip?: boolean;
};

function testImap(user: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user,
      password,
      host: "imap.gmail.com",
      port: 993,
      tls: true,
      tlsOptions: { servername: "imap.gmail.com" },
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

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

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

  try {
    await testImap(username, password);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid credentials or IMAP not enabled",
      },
      { status: 400 },
    );
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
  const { error: insErr } = await supabase.from("gmail_credentials").insert({
    workspace_id: workspaceId,
    email_address: email,
    imap_username: username,
    imap_password_encrypted: encryptedPayload,
    credential_type: "imap",
    status: "connected",
    last_verified_at: now,
  });

  if (insErr) {
    return NextResponse.json({ success: false, error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
