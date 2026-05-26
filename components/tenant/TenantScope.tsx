"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";

export type TenantSessionContext = {
  userId: string;
  teamId: string | null;
  workspaceId: string | null;
};

export type TenantScopeValue = {
  /** True after first successful load or definitive error from context API */
  ready: boolean;
  loading: boolean;
  error: string | null;
  teamId: string | null;
  workspaceId: string | null;
  userId: string | null;
  refetch: () => Promise<void>;
};

export const TenantScopeContext = createContext<TenantScopeValue | null>(null);

async function readSessionContext(): Promise<TenantSessionContext | null> {
  const res = await authenticatedFetch("/api/session/context");
  if (res.status === 401) {
    return null;
  }
  const json = (await res.json()) as {
    user_id?: string;
    team_id?: string | null;
    workspace_id?: string | null;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof json.error === "string" ? json.error : res.statusText || "Context failed",
    );
  }
  if (!json.user_id || typeof json.user_id !== "string") {
    return null;
  }
  return {
    userId: json.user_id,
    teamId:
      typeof json.team_id === "string" && json.team_id.trim()
        ? json.team_id.trim()
        : null,
    workspaceId:
      typeof json.workspace_id === "string" && json.workspace_id.trim()
        ? json.workspace_id.trim()
        : null,
  };
}

export function TenantScopeGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ctx = await readSessionContext();
      if (!ctx) {
        setUserId(null);
        setTeamId(null);
        setWorkspaceId(null);
        setReady(true);
        return;
      }
      setUserId(ctx.userId);
      setTeamId(ctx.teamId);
      setWorkspaceId(ctx.workspaceId);
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load workspace context");
      setReady(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<TenantScopeValue>(
    () => ({
      ready,
      loading,
      error,
      teamId,
      workspaceId,
      userId,
      refetch: load,
    }),
    [ready, loading, error, teamId, workspaceId, userId, load],
  );

  return (
    <TenantScopeContext.Provider value={value}>
      {children}
    </TenantScopeContext.Provider>
  );
}

export function useTenantScope(): TenantScopeValue {
  const ctx = useContext(TenantScopeContext);
  if (!ctx) {
    throw new Error("useTenantScope must be used within TenantScopeGate");
  }
  return ctx;
}

/** Marketing shell / outside `TenantScopeGate` — returns null. */
export function useTenantScopeOptional(): TenantScopeValue | null {
  return useContext(TenantScopeContext);
}

/** Team id for React Query keys; null when no team (use with `TENANT_QUERY_NONE` via queryKeys). */
export function useTenantQueryTeamId(): string | null {
  return useTenantScope().teamId;
}
