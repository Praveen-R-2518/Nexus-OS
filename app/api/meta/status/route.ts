import { NextResponse } from "next/server";
import { requireApiTenantContext } from "@/lib/api-security";
import { META_PLATFORMS } from "@/app/api/meta/helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) {
    return NextResponse.json({ connected: false, platforms: {} });
  }

  if (!tenant.workspaceId) {
    return NextResponse.json({ connected: false, platforms: {} });
  }

  const platformFilter = new URL(request.url).searchParams.get("platform")?.trim();

  let query = tenant.supabase
    .from("meta_credentials")
    .select(
      "id, platform, page_id, page_name, ig_account_id, ig_username, wa_phone_number_id, wa_display_phone, sync_enabled, last_synced_at, status",
    )
    .eq("workspace_id", tenant.workspaceId)
    .eq("user_id", tenant.user.id)
    .eq("status", "connected");

  if (platformFilter && (META_PLATFORMS as readonly string[]).includes(platformFilter)) {
    query = query.eq("platform", platformFilter);
  }

  const { data: rows, error } = await query;

  if (error || !rows || rows.length === 0) {
    return NextResponse.json({ connected: false, platforms: {} });
  }

  const platforms: Record<
    string,
    {
      page_id: string | null;
      page_name: string | null;
      ig_account_id: string | null;
      ig_username: string | null;
      wa_phone_number_id: string | null;
      wa_display_phone: string | null;
      sync_enabled: boolean;
      last_synced_at: string | null;
    }
  > = {};

  for (const row of rows) {
    platforms[row.platform] = {
      page_id: row.page_id,
      page_name: row.page_name,
      ig_account_id: row.ig_account_id,
      ig_username: row.ig_username,
      wa_phone_number_id: row.wa_phone_number_id,
      wa_display_phone: row.wa_display_phone,
      sync_enabled: row.sync_enabled,
      last_synced_at: row.last_synced_at,
    };
  }

  return NextResponse.json({
    connected: true,
    platforms,
  });
}
