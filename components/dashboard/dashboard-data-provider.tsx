"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  emptyDashboardSnapshot,
  fetchDashboardSnapshot,
  type DashboardSnapshot,
} from "@/lib/dashboardData";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";

type DashboardDataState = DashboardSnapshot & {
  loading: boolean;
  refresh: () => Promise<void>;
};

const DashboardDataContext = createContext<DashboardDataState | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(emptyDashboardSnapshot);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextSnapshot = await fetchDashboardSnapshot(supabase);
    setSnapshot(nextSnapshot);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;

    fetchDashboardSnapshot(supabase).then((nextSnapshot) => {
      if (!active) return;
      setSnapshot(nextSnapshot);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <DashboardDataContext.Provider value={{ ...snapshot, loading, refresh }}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const value = useContext(DashboardDataContext);
  if (!value) {
    throw new Error("useDashboardData must be used inside DashboardDataProvider");
  }
  return value;
}
