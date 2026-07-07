import { NextResponse } from "next/server";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireN8nToken,
} from "@/lib/api-security";
import {
  decryptSecret,
  encryptSecret,
  isEncryptionConfigured,
} from "@/lib/encryption/credential-secret";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CredentialRow = {
  id: string;
  workspace_id: string;
  team_id: string | null;
  email_address: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expiry: string | null;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

function tokenNeedsRefresh(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return true;
  const expiryMs = new Date(tokenExpiry).getTime();
  if (Number.isNaN(expiryMs)) return true;
  return expiryMs <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  tokenExpiry: string;
} | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as GoogleTokenResponse;
    if (typeof json.access_token !== "string" || !json.access_token) return null;

    const expiresIn =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in
        : 3600;
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    return { accessToken: json.access_token, tokenExpiry };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(
    request,
    "api:internal:n8n:gmail-credentials",
    60,
    60_000,
  );
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data: rows, error } = await supabase
    .from("gmail_credentials")
    .select(
      "id, workspace_id, team_id, email_address, access_token_encrypted, refresh_token_encrypted, token_expiry",
    )
    .eq("credential_type", "oauth")
    .eq("status", "connected")
    .eq("sync_enabled", true);

  if (error) {
    console.error("[internal n8n gmail-credentials] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load Gmail credentials" },
      { status: 502 },
    );
  }

  const data: Array<{
    id: string;
    workspace_id: string;
    team_id: string | null;
    email_address: string;
    access_token: string;
    token_expiry: string;
  }> = [];

  for (const row of (rows ?? []) as CredentialRow[]) {
    let accessToken: string;
    let tokenExpiry: string;

    try {
      if (!row.access_token_encrypted || !row.refresh_token_encrypted) {
        await supabase
          .from("gmail_credentials")
          .update({ last_sync_error: "Credential data is incomplete" })
          .eq("id", row.id);
        continue;
      }

      accessToken = decryptSecret(row.access_token_encrypted);
      const refreshToken = decryptSecret(row.refresh_token_encrypted);

      if (tokenNeedsRefresh(row.token_expiry)) {
        const refreshed = await refreshAccessToken(refreshToken);
        if (!refreshed) {
          await supabase
            .from("gmail_credentials")
            .update({ last_sync_error: "Token refresh failed" })
            .eq("id", row.id);
          continue;
        }

        let encryptedAccessToken: string;
        try {
          encryptedAccessToken = encryptSecret(refreshed.accessToken);
        } catch {
          await supabase
            .from("gmail_credentials")
            .update({ last_sync_error: "Token refresh failed" })
            .eq("id", row.id);
          continue;
        }

        const { error: patchErr } = await supabase
          .from("gmail_credentials")
          .update({
            access_token_encrypted: encryptedAccessToken,
            token_expiry: refreshed.tokenExpiry,
            last_sync_error: null,
          })
          .eq("id", row.id);

        if (patchErr) {
          console.error(
            "[internal n8n gmail-credentials] Supabase error:",
            patchErr,
          );
          continue;
        }

        accessToken = refreshed.accessToken;
        tokenExpiry = refreshed.tokenExpiry;
      } else {
        tokenExpiry = row.token_expiry!;
      }

      data.push({
        id: row.id,
        workspace_id: row.workspace_id,
        team_id: row.team_id,
        email_address: row.email_address,
        access_token: accessToken,
        token_expiry: tokenExpiry,
      });
    } catch {
      await supabase
        .from("gmail_credentials")
        .update({ last_sync_error: "Failed to decrypt credentials" })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({ success: true, data }, { status: 200 });
}

export async function POST(request: Request) {
  const limited = rateLimit(
    request,
    "api:internal:n8n:gmail-credentials",
    60,
    60_000,
  );
  if (limited) return limited;

  const unauthorized = requireN8nToken(request);
  if (unauthorized) return unauthorized;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const id = parseWorkspaceId(body.id);
  if (!id) {
    return NextResponse.json(
      { success: false, error: "id is required and must be a valid UUID" },
      { status: 400 },
    );
  }

  const lastSyncedAt =
    typeof body.last_synced_at === "string" && body.last_synced_at.trim()
      ? body.last_synced_at.trim()
      : new Date().toISOString();

  let lastSyncError: string | null = null;
  if (body.last_sync_error === null || body.last_sync_error === undefined) {
    lastSyncError = null;
  } else if (typeof body.last_sync_error === "string") {
    lastSyncError = body.last_sync_error.trim().slice(0, 2_000) || null;
  }

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { error } = await supabase
    .from("gmail_credentials")
    .update({
      last_synced_at: lastSyncedAt,
      last_sync_error: lastSyncError,
    })
    .eq("id", id);

  if (error) {
    console.error("[internal n8n gmail-credentials] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update sync status" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
