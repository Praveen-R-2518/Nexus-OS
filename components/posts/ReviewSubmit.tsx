"use client";

/* Signed Supabase Storage URLs are dynamic; plain <img> is intentional. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { POST_MEDIA_BUCKET, updatePostStatus } from "@/lib/posts/data";
import { PLATFORM_LABELS } from "@/lib/posts/types";
import type { Platform, SocialPost } from "@/lib/posts/types";
import { cn } from "@/lib/utils";
import { PlatformIcon, PRIMARY_BTN, StatusBadge, useSignedUrl } from "./shared";

interface ReviewSubmitProps {
  orgId: string;
  post: SocialPost;
  notify: (msg: string) => void;
  onSubmitted: () => void;
}

export function ReviewSubmit({ orgId, post, notify, onSubmitted }: ReviewSubmitProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { url: mediaUrl } = useSignedUrl(POST_MEDIA_BUCKET, post.media_url);
  const platforms = useMemo<Platform[]>(
    () =>
      (post.platforms ?? []).length
        ? (post.platforms as Platform[])
        : (Object.keys(post.captions ?? {}) as Platform[]),
    [post.platforms, post.captions],
  );
  const [activeTab, setActiveTab] = useState<Platform>(platforms[0] ?? "instagram");
  const [submitting, setSubmitting] = useState(false);

  const activeCaption = post.captions?.[activeTab] ?? null;
  const isDraft = post.status === "draft";

  async function submit() {
    setSubmitting(true);
    try {
      await updatePostStatus(supabase, orgId, post.id, "pending_approval");
      onSubmitted();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not submit for approval.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="app-glass-card overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {mediaUrl ? (
            <img
              src={mediaUrl}
              alt="Post media"
              className="max-h-[26rem] w-full object-contain bg-black/5 dark:bg-white/5"
            />
          ) : (
            <div className="flex h-64 items-center justify-center text-muted">
              <Spinner className="h-6 w-6" label="Loading media" />
            </div>
          )}
        </div>

        <div className="app-glass-card rounded-xl p-4">
          <div className="flex flex-wrap gap-2 hairline-b pb-3">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setActiveTab(p)}
                aria-current={activeTab === p ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === p
                    ? "bg-nexus-approval-soft text-nexus-approval"
                    : "text-muted hover:bg-glass",
                )}
              >
                <PlatformIcon platform={p} />
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="pt-4">
            {activeCaption ? (
              <>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-atmospheric-grey">
                  {activeCaption.caption}
                </p>
                {activeCaption.hashtags?.length ? (
                  <p className="mt-3 text-sm font-medium text-nexus-intake">
                    {activeCaption.hashtags
                      .map((h) => `#${h.replace(/^#/, "")}`)
                      .join(" ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                No caption for {PLATFORM_LABELS[activeTab]}.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 hairline-t pt-6">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Status</span>
          <StatusBadge status={post.status} />
        </div>
        {isDraft ? (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className={PRIMARY_BTN}
          >
            {submitting ? (
              <Spinner className="h-4 w-4" label="Submitting" />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            Submit for Approval
          </button>
        ) : post.status === "pending_approval" ? (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-status-positive">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            In the approval queue.
          </p>
        ) : null}
      </div>
      <p className="text-xs text-muted">
        Publishing runs through a separate approval workflow — you can&apos;t publish
        directly from here.
      </p>
    </div>
  );
}
