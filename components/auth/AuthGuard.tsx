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
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/signup",
  "/auth/callback",
]);

function isPublicAuthPath(pathname: string): boolean {
  if (PUBLIC_AUTH_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/signup/")) return true;
  if (pathname.startsWith("/auth/callback")) return true;
  return false;
}

type AuthGuardContextValue = {
  teamId: string | null;
  profileReady: boolean;
  refetchProfile: () => Promise<void>;
};

const AuthGuardContext = createContext<AuthGuardContextValue | null>(null);

export function useAuthGuard(): AuthGuardContextValue {
  const ctx = useContext(AuthGuardContext);
  if (!ctx) {
    throw new Error("useAuthGuard must be used within AuthGuard");
  }
  return ctx;
}

export function AuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [teamId, setTeamId] = useState<string | null | undefined>(undefined);
  const [profileReady, setProfileReady] = useState(false);

  const loadProfileTeam = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      setTeamId(null);
      setProfileReady(true);
      if (!isPublicAuthPath(pathname)) {
        const qs = searchParams.toString();
        const next = pathname + (qs ? `?${qs}` : "");
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
      return;
    }
    const { data, error } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[AuthGuard] profiles:", error.message);
      setTeamId(null);
      setProfileReady(true);
      return;
    }
    const raw = data && (data as { team_id?: unknown }).team_id;
    const tid =
      typeof raw === "string" && raw.trim() ? raw.trim() : null;
    setTeamId(tid);
    setProfileReady(true);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    void loadProfileTeam();
  }, [loadProfileTeam]);

  useEffect(() => {
    if (!profileReady || teamId === undefined) return;

    if (isPublicAuthPath(pathname)) return;

    const nextParam = searchParams.toString();
    const next =
      pathname + (nextParam ? `?${nextParam}` : "");

    if (teamId === null) {
      router.replace(`/signup?step=workspace&next=${encodeURIComponent(next)}`);
      return;
    }

    if (pathname === "/onboarding") {
      const rawNext = searchParams.get("next");
      const safeNext =
        rawNext &&
        rawNext.startsWith("/") &&
        !rawNext.startsWith("//")
          ? rawNext
          : "/dashboard";
      router.replace(safeNext);
    }
  }, [profileReady, teamId, pathname, router, searchParams]);

  const value = useMemo<AuthGuardContextValue>(
    () => ({
      teamId: teamId === undefined ? null : teamId,
      profileReady,
      refetchProfile: loadProfileTeam,
    }),
    [teamId, profileReady, loadProfileTeam],
  );

  if (!profileReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-mono text-xs uppercase tracking-widest text-muted">
        Resolving workspace access…
      </div>
    );
  }

  if (teamId === null && !isPublicAuthPath(pathname)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center font-mono text-xs uppercase tracking-widest text-muted">
        Redirecting to signup…
      </div>
    );
  }

  return (
    <AuthGuardContext.Provider value={value}>{children}</AuthGuardContext.Provider>
  );
}
