"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type AppChromeSearchContextValue = {
  query: string;
  setQuery: (query: string) => void;
};

const AppChromeSearchContext = createContext<AppChromeSearchContextValue | null>(
  null,
);

export function AppChromeSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    setQuery("");
  }, [pathname]);

  return (
    <AppChromeSearchContext.Provider value={{ query, setQuery }}>
      {children}
    </AppChromeSearchContext.Provider>
  );
}

export function useAppChromeSearch() {
  const ctx = useContext(AppChromeSearchContext);
  if (!ctx) {
    throw new Error(
      "useAppChromeSearch must be used within AppChromeSearchProvider",
    );
  }
  return ctx;
}

export function useAppChromeSearchOptional() {
  return useContext(AppChromeSearchContext);
}
