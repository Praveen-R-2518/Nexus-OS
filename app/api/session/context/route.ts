import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-security";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let supabase;
  try {
    supabase = createSupabaseRouteHandlerClient();
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Server configuration error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  const teamIdRaw = profile && (profile as { team_id?: unknown }).team_id;
  const teamId =
    typeof teamIdRaw === "string" && teamIdRaw.trim() ? teamIdRaw.trim() : null;

  let workspaceId: string | null = null;
  if (teamId) {
    const { data: ws, error: wsErr } = await supabase
      .from("workspaces")
      .select("id")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!wsErr && ws && typeof (ws as { id?: unknown }).id === "string") {
      workspaceId = (ws as { id: string }).id.trim() || null;
    }
  }

  return NextResponse.json({
    user_id: auth.user.id,
    team_id: teamId,
    workspace_id: workspaceId,
  });
}
