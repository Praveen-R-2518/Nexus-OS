import type { SupabaseClient } from "@supabase/supabase-js";

function trimmedUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Resolves organization_id for the authenticated user. Primary source is
 * `user_profiles.organization_id`; when null, falls back to `teams.organization_id`
 * via the caller's team (profiles.team_id → workspace_members → team owner).
 */
export async function resolveOrganizationIdForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: userProfile, error: profileErr } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) throw profileErr;

  const fromUserProfile = trimmedUuid(
    userProfile && (userProfile as { organization_id?: unknown }).organization_id,
  );
  if (fromUserProfile) return fromUserProfile;

  let teamId: string | null = null;

  const { data: tenantProfile, error: tenantErr } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();

  if (tenantErr) throw tenantErr;
  teamId = trimmedUuid(tenantProfile && (tenantProfile as { team_id?: unknown }).team_id);

  if (!teamId) {
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("team_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (memberErr) throw memberErr;
    teamId = trimmedUuid(membership && (membership as { team_id?: unknown }).team_id);
  }

  if (teamId) {
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("organization_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamErr) throw teamErr;
    const fromTeam = trimmedUuid(
      team && (team as { organization_id?: unknown }).organization_id,
    );
    if (fromTeam) return fromTeam;
  }

  const { data: ownedTeam, error: ownerErr } = await supabase
    .from("teams")
    .select("organization_id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();

  if (ownerErr) throw ownerErr;
  return trimmedUuid(
    ownedTeam && (ownedTeam as { organization_id?: unknown }).organization_id,
  );
}
