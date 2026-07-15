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
import { metaGraphUrl } from "@/app/api/meta/helpers";

export const dynamic = "force-dynamic";

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type CredentialRow = {
  id: string;
  workspace_id: string;
  team_id: string | null;
  platform: string;
  page_id: string | null;
  ig_account_id: string | null;
  wa_phone_number_id: string | null;
  access_token_encrypted: string | null;
  token_expiry: string | null;
};

type MetaDebugTokenResponse = {
  data?: { is_valid?: boolean; expires_at?: number };
};

function tokenNeedsRefresh(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return true;
  const expiryMs = new Date(tokenExpiry).getTime();
  if (Number.isNaN(expiryMs)) return true;
  return expiryMs <= Date.now() + TOKEN_REFRESH_BUFFER_MS;
}

async function refreshPageAccessToken(
  pageId: string,
  currentToken: string,
): Promise<{ accessToken: string; tokenExpiry: string } | null> {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;

  try {
    const url = metaGraphUrl(`/${pageId}`, {
      fields: "access_token",
      access_token: currentToken,
    });
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) return null;

    const debugUrl = metaGraphUrl("/debug_token", {
      input_token: json.access_token,
      access_token: `${appId}|${appSecret}`,
    });
    const debugRes = await fetch(debugUrl);
    let expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;
    if (debugRes.ok) {
      const debug = (await debugRes.json()) as MetaDebugTokenResponse;
      if (debug.data?.expires_at) {
        expiresAt = debug.data.expires_at * 1000;
      }
    }

    return {
      accessToken: json.access_token,
      tokenExpiry: new Date(expiresAt).toISOString(),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const limited = rateLimit(
    request,
    "api:internal:n8n:meta-credentials",
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

  const url = new URL(request.url);
  const platformFilter = url.searchParams.get("platform")?.trim();
  // Optional least-privilege scoping (see gmail-credentials): bulk stays default.
  const workspaceFilter = parseWorkspaceId(url.searchParams.get("workspace_id"));

  let query = supabase
    .from("meta_credentials")
    .select(
      "id, workspace_id, team_id, platform, page_id, ig_account_id, wa_phone_number_id, access_token_encrypted, token_expiry",
    )
    .eq("status", "connected")
    .eq("sync_enabled", true);

  if (platformFilter) {
    query = query.eq("platform", platformFilter);
  }
  if (workspaceFilter) {
    query = query.eq("workspace_id", workspaceFilter);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("[internal n8n meta-credentials] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load Meta credentials" },
      { status: 502 },
    );
  }

  const data: Array<{
    id: string;
    workspace_id: string;
    team_id: string | null;
    platform: string;
    page_id: string | null;
    ig_account_id: string | null;
    wa_phone_number_id: string | null;
    access_token: string;
    token_expiry: string;
  }> = [];

  for (const row of (rows ?? []) as CredentialRow[]) {
    try {
      if (!row.access_token_encrypted) {
        await supabase
          .from("meta_credentials")
          .update({ last_sync_error: "Credential data is incomplete" })
          .eq("id", row.id);
        continue;
      }

      let accessToken = decryptSecret(row.access_token_encrypted);
      let tokenExpiry = row.token_expiry ?? new Date(Date.now() + 3600_000).toISOString();

      if (tokenNeedsRefresh(row.token_expiry) && row.page_id) {
        const refreshed = await refreshPageAccessToken(row.page_id, accessToken);
        if (refreshed) {
          const encrypted = encryptSecret(refreshed.accessToken);
          await supabase
            .from("meta_credentials")
            .update({
              access_token_encrypted: encrypted,
              token_expiry: refreshed.tokenExpiry,
              last_sync_error: null,
            })
            .eq("id", row.id);
          accessToken = refreshed.accessToken;
          tokenExpiry = refreshed.tokenExpiry;
        } else {
          await supabase
            .from("meta_credentials")
            .update({ last_sync_error: "Token refresh failed" })
            .eq("id", row.id);
        }
      }

      data.push({
        id: row.id,
        workspace_id: row.workspace_id,
        team_id: row.team_id,
        platform: row.platform,
        page_id: row.page_id,
        ig_account_id: row.ig_account_id,
        wa_phone_number_id: row.wa_phone_number_id,
        access_token: accessToken,
        token_expiry: tokenExpiry,
      });
    } catch {
      await supabase
        .from("meta_credentials")
        .update({ last_sync_error: "Failed to decrypt credentials" })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({ success: true, data }, { status: 200 });
}

export async function POST(request: Request) {
  const limited = rateLimit(
    request,
    "api:internal:n8n:meta-credentials",
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
    .from("meta_credentials")
    .update({
      last_synced_at: lastSyncedAt,
      last_sync_error: lastSyncError,
    })
    .eq("id", id);

  if (error) {
    console.error("[internal n8n meta-credentials] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update sync status" },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
