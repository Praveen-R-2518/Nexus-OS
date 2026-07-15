"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Globe,
  LogOut,
  Menu,
  Search,
  Settings,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAppChromeSearch } from "@/components/layout/AppChromeSearch";
import { cn } from "@/lib/utils";

const LANGUAGE_OPTIONS = [
  { code: "en", label: "English", enabled: true },
  { code: "es", label: "Español", enabled: false },
  { code: "fr", label: "Français", enabled: false },
] as const;

function profileInitial(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  return (local.charAt(0) || "?").toUpperCase();
}

export function AppTopBar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { query, setQuery } = useAppChromeSearch();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const languageRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (languageRef.current && !languageRef.current.contains(target)) {
        setLanguageOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const avatarInitial = useMemo(() => profileInitial(userEmail), [userEmail]);

  async function signOut() {
    setProfileOpen(false);
    queryClient.clear();
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="app-topbar sticky top-0 z-20 shrink-0 px-4 py-3 md:px-8 lg:px-10">
      <div className="flex items-center gap-3">
        {onOpenMobileNav ? (
          <button
            type="button"
            onClick={onOpenMobileNav}
            className="app-topbar-icon-btn inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center transition-colors lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        ) : null}

        <div className="relative min-w-0 max-w-sm flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--app-topbar-search-placeholder)]"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search inbox & approval…"
            className="app-topbar-search h-9 w-full min-w-0 py-1.5 pl-9 pr-3.5 outline-none transition"
            aria-label="Search inbox and approval"
          />
        </div>

        <div className="min-w-0 flex-1" aria-hidden />

        <div className="flex shrink-0 items-center gap-2">
          <div ref={languageRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setLanguageOpen((open) => !open);
                setProfileOpen(false);
              }}
              className="app-topbar-icon-btn inline-flex h-10 cursor-pointer items-center gap-1.5 px-3 text-sm transition-colors"
              aria-expanded={languageOpen}
              aria-haspopup="listbox"
              aria-label="Language"
            >
              <Globe className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">EN</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
            </button>
            {languageOpen ? (
              <div
                className="app-topbar-menu absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-[11rem] rounded-xl p-1.5"
                role="listbox"
                aria-label="Language options"
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    disabled={!option.enabled}
                    onClick={() => option.enabled && setLanguageOpen(false)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                      option.enabled
                        ? "text-atmospheric-grey hover:bg-surface-muted"
                        : "cursor-not-allowed text-muted opacity-60",
                    )}
                    role="option"
                    aria-selected={option.enabled}
                  >
                    <span>{option.label}</span>
                    {!option.enabled ? (
                      <span className="text-[10px] uppercase tracking-wide text-muted">
                        Soon
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((open) => !open);
                setLanguageOpen(false);
              }}
              className="relative inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--app-topbar-border)] bg-[var(--app-topbar-icon-bg)] text-sm font-semibold text-[var(--app-topbar-icon-fg)] transition hover:text-[var(--app-topbar-search-fg)]"
              aria-expanded={profileOpen}
              aria-haspopup="menu"
              aria-label="Profile menu"
            >
              {avatarInitial}
              <span
                className="app-topbar-profile-dot absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full"
                aria-hidden
              />
            </button>
            {profileOpen ? (
              <div
                className="app-topbar-menu absolute right-0 top-[calc(100%+0.5rem)] z-30 min-w-[14rem] rounded-xl p-2"
                role="menu"
              >
                <div className="border-b border-[var(--app-topbar-border)] px-3 py-2.5">
                  <p className="text-xs text-muted">Signed in as</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-atmospheric-grey">
                    {userEmail ?? "Unknown account"}
                  </p>
                </div>
                <div className="py-1">
                  <Link
                    href="/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-atmospheric-grey transition hover:bg-surface-muted"
                    role="menuitem"
                  >
                    <Settings className="h-4 w-4 shrink-0" aria-hidden />
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-atmospheric-grey transition hover:bg-surface-muted"
                    role="menuitem"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                    Log out
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
