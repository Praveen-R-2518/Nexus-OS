"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Resolves the current authenticated user's id and `organization_id`.
 *
 * Org-scoped tables (organizations, user_profiles, invites, social_*) isolate on
 *   organization_id IN (SELECT organization_id FROM user_profiles WHERE id = auth.uid())
 * so the org id must come from the caller's own `user_profiles` row, read through
 * the authenticated browser client — the exact source RLS checks against.
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

        const { data, error: profileErr } = await supabase
          .from("user_profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profileErr) throw profileErr;

        const orgId =
          data && typeof (data as { organization_id?: unknown }).organization_id === "string"
            ? ((data as { organization_id: string }).organization_id.trim() || null)
            : null;

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
