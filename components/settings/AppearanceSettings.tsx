"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  FONT_SCALE_OPTIONS,
  THEME_OPTIONS,
  type FontScale,
  readFontScale,
  writeFontScale,
} from "@/lib/appearance-prefs";
import { cn } from "@/lib/utils";

function ThemeIcon({ id }: { id: "dark" | "light" }) {
  if (id === "dark") return <Moon className="h-4 w-4 shrink-0" aria-hidden />;
  return <Sun className="h-4 w-4 shrink-0" aria-hidden />;
}

export function AppearanceSettings() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [fontScale, setFontScale] = useState<FontScale>("default");

  useEffect(() => {
    setMounted(true);
    setFontScale(readFontScale());
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-4">
        <div className="glass-skeleton h-24 animate-pulse rounded-xl" />
        <div className="glass-skeleton h-20 animate-pulse rounded-xl" />
      </div>
    );
  }

  const activeTheme = theme === "system" ? resolvedTheme ?? "dark" : theme ?? "dark";

  function handleFontScaleChange(scale: FontScale) {
    setFontScale(scale);
    writeFontScale(scale);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-atmospheric-grey">Theme</p>
        <p className="mt-1 text-xs text-muted">
          Applies across the dashboard. Sidebar toggle stays in sync.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {THEME_OPTIONS.map((option) => {
            const selected = activeTheme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTheme(option.id)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left transition",
                  selected
                    ? "border-nexus-approval-border bg-nexus-approval-soft"
                    : "border-glass-border bg-glass hover:bg-surface-muted",
                )}
                aria-pressed={selected}
              >
                <ThemeIcon id={option.id} />
                <span>
                  <span className="block text-sm font-medium text-atmospheric-grey">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-atmospheric-grey">Dashboard font size</p>
        <p className="mt-1 text-xs text-muted">
          Scales text inside the authenticated app shell only.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {FONT_SCALE_OPTIONS.map((option) => {
            const selected = fontScale === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleFontScaleChange(option.value)}
                className={cn(
                  "cursor-pointer rounded-xl border px-4 py-3 text-left transition",
                  selected
                    ? "border-nexus-approval-border bg-nexus-approval-soft"
                    : "border-glass-border bg-glass hover:bg-surface-muted",
                )}
                aria-pressed={selected}
              >
                <span className="block text-sm font-medium text-atmospheric-grey">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-glass-border px-4 py-3 text-xs text-muted">
        <Monitor className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Appearance preferences are stored on this device. They apply immediately and do not
          require saving.
        </span>
      </div>
    </div>
  );
}
