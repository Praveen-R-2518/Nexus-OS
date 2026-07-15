"use client";

/* Signed Supabase Storage URLs are dynamic; plain <img> is intentional. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { CalendarClock, Send, Trash2, Undo2 } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  POST_MEDIA_BUCKET,
  deletePost,
  schedulePost,
  unschedulePost,
} from "@/lib/posts/data";
import { publishPost } from "@/lib/posts/webhooks";
import { PLATFORM_LABELS } from "@/lib/posts/types";
import type { Platform, SocialPost } from "@/lib/posts/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { ConfirmPublishDialog, ScheduleDialog } from "./PostActionDialogs";
import { PlatformIcon, PRIMARY_BTN, SECONDARY_BTN, StatusBadge, useSignedUrl } from "./shared";

interface ReviewSubmitProps {
  orgId: string;
  post: SocialPost;
  notify: (msg: string) => void;
  /** Fired after an action changes the post (refresh board + go back). */
  onDone: () => void;
}

type Busy = null | "publish" | "schedule" | "unschedule" | "delete";

export function ReviewSubmit({ orgId, post, notify, onDone }: ReviewSubmitProps) {
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
  const [busy, setBusy] = useState<Busy>(null);
  const [dialog, setDialog] = useState<null | "schedule" | "publish">(null);

  const activeCaption =
    post.captions?.[activeTab]?.caption ?? post.user_description ?? null;
  const captionPreview = platforms
    .map((p) => post.captions?.[p]?.caption)
    .find(Boolean) ?? post.user_description ?? "";

  const canAct = post.status === "draft" || post.status === "scheduled" || post.status === "failed";

  async function doPublish() {
    setBusy("publish");
    try {
      await publishPost({ postId: post.id });
      notify("Publishing…");
      setDialog(null);
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(null);
    }
  }

  async function doSchedule(iso: string) {
    setBusy("schedule");
    try {
      await schedulePost(supabase, orgId, post.id, iso);
      notify("Post scheduled.");
      setDialog(null);
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not schedule.");
    } finally {
      setBusy(null);
    }
  }

  async function doUnschedule() {
    setBusy("unschedule");
    try {
      await unschedulePost(supabase, orgId, post.id);
      notify("Moved back to draft.");
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not unschedule.");
    } finally {
      setBusy(null);
    }
  }

  async function doDelete() {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    setBusy("delete");
    try {
      await deletePost(supabase, orgId, post.id);
      notify("Post deleted.");
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(null);
    }
  }

  const busyAny = busy !== null;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="app-glass-card overflow-hidden rounded-xl">
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
                  {activeCaption}
                </p>
                {post.captions?.[activeTab]?.hashtags?.length ? (
                  <p className="mt-3 text-sm font-medium text-nexus-intake">
                    {post.captions[activeTab]!.hashtags
                      .map((h) => `#${h.replace(/^#/, "")}`)
                      .join(" ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">No caption.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 hairline-t pt-6">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Status</span>
          <StatusBadge status={post.status} />
          {post.status === "scheduled" && post.scheduled_at ? (
            <span className="text-xs">· publishes {formatRelativeTime(post.scheduled_at)}</span>
          ) : null}
        </div>

        {post.status === "failed" && post.publish_error ? (
          <p className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical">
            {post.publish_error}
          </p>
        ) : null}

        {canAct ? (
          <div className="flex flex-wrap gap-2">
            {post.status === "scheduled" ? (
              <button type="button" onClick={() => void doUnschedule()} disabled={busyAny} className={SECONDARY_BTN}>
                {busy === "unschedule" ? <Spinner className="h-4 w-4" label="Working" /> : <Undo2 className="h-4 w-4" aria-hidden />}
                Unschedule
              </button>
            ) : (
              <button type="button" onClick={() => setDialog("schedule")} disabled={busyAny} className={SECONDARY_BTN}>
                <CalendarClock className="h-4 w-4" aria-hidden />
                Schedule
              </button>
            )}
            <button type="button" onClick={() => setDialog("publish")} disabled={busyAny} className={PRIMARY_BTN}>
              <Send className="h-4 w-4" aria-hidden />
              {post.status === "failed" ? "Retry publish" : "Publish now"}
            </button>
            <button type="button" onClick={() => void doDelete()} disabled={busyAny} className={SECONDARY_BTN}>
              {busy === "delete" ? <Spinner className="h-4 w-4" label="Deleting" /> : <Trash2 className="h-4 w-4" aria-hidden />}
              Delete
            </button>
          </div>
        ) : post.status === "publishing" ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" label="Publishing" /> Publishing to platforms…
          </p>
        ) : (
          <p className="text-sm text-muted">This post has been published.</p>
        )}
      </div>

      {dialog === "schedule" ? (
        <ScheduleDialog
          initialIso={post.scheduled_at}
          busy={busy === "schedule"}
          onConfirm={(iso) => void doSchedule(iso)}
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog === "publish" ? (
        <ConfirmPublishDialog
          platforms={platforms}
          captionPreview={captionPreview}
          busy={busy === "publish"}
          onConfirm={() => void doPublish()}
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
