import { NextResponse } from "next/server";
import { rateLimitDurable, requireN8nJobOrBootstrapToken } from "@/lib/api-security";
import {
  decryptSecret,
  isEncryptionConfigured,
} from "@/lib/encryption/credential-secret";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";

type CredentialRow = {
  id: string;
  organization_id: string;
  platform: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
};

export async function GET(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:social-credentials",
    60,
    60_000,
  );
  if (limited) return limited;

  const organizationId = parseWorkspaceId(
    new URL(request.url).searchParams.get("organization_id"),
  );
  if (!organizationId) {
    return NextResponse.json(
      {
        success: false,
        error: "organization_id is required and must be a valid UUID",
      },
      { status: 400 },
    );
  }

  const unauthorized = await requireN8nJobOrBootstrapToken(
    request,
    "read_social_credentials",
    { resourceType: "organization", resourceId: organizationId },
    "internal n8n social-credentials GET",
  );
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
    .from("social_credentials")
    .select(
      "id, organization_id, platform, access_token_encrypted, refresh_token_encrypted, token_expires_at",
    )
    .eq("organization_id", organizationId);

  if (error) {
    console.error("[internal n8n social-credentials] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load social credentials" },
      { status: 502 },
    );
  }

  const data: Array<{
    id: string;
    organization_id: string;
    platform: string;
    access_token: string;
    refresh_token: string | null;
    token_expires_at: string | null;
  }> = [];

  for (const row of (rows ?? []) as CredentialRow[]) {
    try {
      if (!row.access_token_encrypted) {
        continue;
      }

      const accessToken = decryptSecret(row.access_token_encrypted);
      let refreshToken: string | null = null;
      if (row.refresh_token_encrypted) {
        refreshToken = decryptSecret(row.refresh_token_encrypted);
      }

      data.push({
        id: row.id,
        organization_id: row.organization_id,
        platform: row.platform,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: row.token_expires_at,
      });
    } catch {
      console.error(
        "[internal n8n social-credentials] Failed to decrypt credential",
        row.id,
      );
    }
  }

  return NextResponse.json({ success: true, data }, { status: 200 });
}
