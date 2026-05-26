"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-11 w-11 shrink-0 rounded-lg border border-transparent" aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={() =>
        setTheme(resolvedTheme === "dark" ? "light" : "dark")
      }
      className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-white text-black/70 transition-colors duration-interaction hover:bg-ref-mint hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ref-cta focus-visible:ring-offset-0 focus-visible:ring-offset-white dark:border-border dark:bg-surface-card dark:text-white/70 dark:hover:bg-surface-elevated dark:focus-visible:ring-border-strong"
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-5 w-5" aria-hidden />
      ) : (
        <Moon className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
