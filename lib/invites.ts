"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthRedirectOrigin } from "@/lib/auth/redirect-url";

/** Roles allowed by the user_profiles CHECK constraint (owner is not invitable). */
export type InviteRole = "member" | "admin";
export const INVITE_ROLES: InviteRole[] = ["member", "admin"];

export type InviteStatus = "pending" | "accepted" | "expired";

export interface Invite {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  token: string;
  status: InviteStatus;
  invited_by: string | null;
  created_at: string;
  expires_at: string | null;
}

/** Result of the public invite_preview RPC — org name + coarse status only. */
export interface InvitePreview {
  organization_name: string;
  status: InviteStatus;
}

export function buildInviteLink(token: string): string {
  return `${getAuthRedirectOrigin()}/signup?invite=${encodeURIComponent(token)}`;
}

export async function listInvites(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Invite[]> {
  const { data, error } = await supabase
    .from("invites")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invite[];
}

/**
 * Create a pending invite. The DB generates `token`, `status='pending'`, and
 * `expires_at` (now + 7 days) by default — we never set the token ourselves.
 * RLS restricts this insert to the caller's own organization.
 */
export async function createInvite(
  supabase: SupabaseClient,
  input: { orgId: string; email: string; role: InviteRole; invitedBy: string | null },
): Promise<Invite> {
  const { data, error } = await supabase
    .from("invites")
    .insert({
      organization_id: input.orgId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      invited_by: input.invitedBy,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Invite;
}

/**
 * Safe, unauthenticated lookup used on the signup page. Returns null when the
 * token doesn't resolve. Exposes only org name + status (see the RPC).
 */
export async function fetchInvitePreview(
  supabase: SupabaseClient,
  token: string,
): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc("invite_preview", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.organization_name !== "string") return null;
  return {
    organization_name: row.organization_name,
    status: (row.status as InviteStatus) ?? "pending",
  };
}
