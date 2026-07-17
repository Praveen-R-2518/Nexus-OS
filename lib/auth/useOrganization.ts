"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveOrganizationIdForUser } from "@/lib/organization-bridge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Resolves the current authenticated user's id and `organization_id`.
 *
 * Org-scoped tables (organizations, user_profiles, invites, social_*) isolate on
 *   organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
 * so the org id must come from the caller's own `user_profiles` row, read through
 * the authenticated browser client — the exact source RLS checks against.
 *
 * When `user_profiles.organization_id` is null, falls back to `teams.organization_id`
 * for the user's team (profiles.team_id / workspace_members / team owner).
 */
export function useOrganization(): {
  userId: string | null;
  organizationId: string | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  refetch: () => void;
} {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) {
          if (!cancelled) {
            setUserId(null);
            setOrganizationId(null);
            setReady(true);
          }
          return;
        }

        const orgId = await resolveOrganizationIdForUser(supabase, user.id);

        if (!cancelled) {
          setUserId(user.id);
          setOrganizationId(orgId);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not resolve organization");
          setReady(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, nonce]);

  return {
    userId,
    organizationId,
    loading,
    ready,
    error,
    refetch: () => setNonce((n) => n + 1),
  };
}
