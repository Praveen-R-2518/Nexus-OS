"use client";

import { useEffect, useMemo, useState } from "react";
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaXTwitter } from "react-icons/fa6";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { signStoragePath } from "@/lib/posts/data";
import { PLATFORM_LABELS, STATUS_LABELS } from "@/lib/posts/types";
import type { Platform, PostStatus } from "@/lib/posts/types";
import { cn } from "@/lib/utils";

/** Shared button styles — matched to the Chat / Dashboard action buttons. */
export const PRIMARY_BTN =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-2 text-[13px] font-medium text-nexus-approval transition-colors hover:bg-nexus-approval-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50";

export const SECONDARY_BTN =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-muted px-4 py-2 text-sm font-medium text-atmospheric-grey transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50";

const PLATFORM_ICONS: Record<Platform, typeof FaInstagram> = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  x: FaXTwitter,
  linkedin: FaLinkedinIn,
};

export function PlatformIcon({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  const Icon = PLATFORM_ICONS[platform];
  return (
    <Icon
      className={cn("h-4 w-4 shrink-0", className)}
      aria-label={PLATFORM_LABELS[platform]}
    />
  );
}

const STATUS_STYLES: Record<PostStatus, string> = {
  draft: "border-border-strong bg-surface-muted text-atmospheric-grey/70 dark:text-atmospheric-grey/60",
  scheduled:
    "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  publishing: "border-nexus-growth-border bg-nexus-growth-soft text-status-positive",
  published: "border-nexus-execution-border bg-nexus-execution-soft text-nexus-execution",
  failed: "border-status-critical-border bg-status-critical-surface text-status-critical",
};

export function StatusBadge({
  status,
  className,
}: {
  status: PostStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[1.75rem] items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-normal sm:text-xs",
        STATUS_STYLES[status] ?? STATUS_STYLES.draft,
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * Sign a private storage path for display. Re-signs when the path changes.
 * Never cache signed URLs long-term — this hook lives with the component.
 */
export function useSignedUrl(bucket: string, path: string | null | undefined): {
  url: string | null;
  loading: boolean;
} {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const signed = await signStoragePath(supabase, bucket, path);
      if (!cancelled) {
        setUrl(signed);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, bucket, path]);

  return { url, loading };
}
