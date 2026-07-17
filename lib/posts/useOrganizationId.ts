"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveOrganizationIdForUser } from "@/lib/organization-bridge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Resolves the current authenticated user's `organization_id`.
 *
 * The Post unit's tables (`social_posts`, `post_generations`, `brand_assets`)
 * and the `post-media` / `brand-assets` storage buckets are all isolated by
 *
 *   organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
 *
 * so the org id must come from the caller's own `user_profiles` row, read
 * through the authenticated (anon-key) browser client — that is the exact
 * source RLS checks against. We never read a service-role key on the client
 * and never hardcode an org id.
 *
 * When `user_profiles.organization_id` is null, falls back to `teams.organization_id`
 * for the user's team (profiles.team_id / workspace_members / team owner).
 */
export function useOrganizationId(): {
  organizationId: string | null;
  loading: boolean;
  /** True once the lookup has resolved (success or definitive miss). */
  ready: boolean;
  error: string | null;
  refetch: () => void;
} {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
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
            setOrganizationId(null);
            setReady(true);
          }
          return;
        }

        const orgId = await resolveOrganizationIdForUser(supabase, user.id);

        if (!cancelled) {
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
    organizationId,
    loading,
    ready,
    error,
    refetch: () => setNonce((n) => n + 1),
  };
}
