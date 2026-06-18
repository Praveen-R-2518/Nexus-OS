import { NextResponse } from "next/server";
import { requireApiTenantContext } from "@/lib/api-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ connected: false });
  }

  if (!tenant.workspaceId) {
    return NextResponse.json({ connected: false });
  }

  const { data: row, error } = await tenant.supabase
    .from("gmail_credentials")
    .select(
      "id, email_address, sync_enabled, last_synced_at, credential_type, status",
    )
    .eq("workspace_id", tenant.workspaceId)
    .eq("user_id", tenant.user.id)
    .eq("credential_type", "oauth")
    .eq("status", "connected")
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: row.email_address,
    sync_enabled: row.sync_enabled,
    last_synced_at: row.last_synced_at,
  });
}
