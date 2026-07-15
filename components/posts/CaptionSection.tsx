"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Save, Send, Sparkles, Wand2 } from "lucide-react";
import { FilterChip } from "@/components/ui/FilterChip";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  captionsFromText,
  createPost,
  listConnectedPlatforms,
} from "@/lib/posts/data";
import {
  enhanceCaption,
  generateCaptions,
  publishPost,
  visionCaption,
} from "@/lib/posts/webhooks";
import { POST_PLATFORMS, PLATFORM_LABELS } from "@/lib/posts/types";
import type { Platform, PostCaptions, SocialPost } from "@/lib/posts/types";
import { cn } from "@/lib/utils";
import { ConfirmPublishDialog, ScheduleDialog } from "./PostActionDialogs";
import { PlatformIcon, PRIMARY_BTN, SECONDARY_BTN } from "./shared";

interface CaptionSectionProps {
  orgId: string;
  /** Storage path of the media this post is about (upload path or AI image). */
  mediaUrl: string;
  notify: (msg: string) => void;
  /** Provenance for the created row. */
  source?: SocialPost["source"];
  generationId?: string | null;
  /** Vision captioning only makes sense with an image present. */
  showVisionButton?: boolean;
  /** Fired after a draft/scheduled/publish action completes. */
  onDone: () => void;
}

type Busy = null | "vision" | "enhance" | "variants" | "draft" | "schedule" | "upload";

export function CaptionSection({
  orgId,
  mediaUrl,
  notify,
  source = "upload",
  generationId = null,
  showVisionButton = true,
  onDone,
}: CaptionSectionProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [description, setDescription] = useState("");
  const [captions, setCaptions] = useState<PostCaptions | null>(null);
  const [activeTab, setActiveTab] = useState<Platform>("instagram");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | "schedule" | "upload">(null);

  const { data: connected = [] } = useQuery({
    queryKey: ["connected-platforms", orgId],
    queryFn: () => listConnectedPlatforms(supabase, orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  const connectedSet = useMemo(() => new Set(connected), [connected]);
  const allConnected = POST_PLATFORMS.every((p) => connectedSet.has(p));
  const [platforms, setPlatforms] = useState<Platform[] | null>(null);
  // Default the selection to connected platforms once the query resolves.
  const selected = platforms ?? connected;

  function togglePlatform(p: Platform) {
    if (!connectedSet.has(p)) return;
    setPlatforms((prev) => {
      const base = prev ?? connected;
      return base.includes(p) ? base.filter((x) => x !== p) : [...base, p];
    });
  }

  /** Assemble the captions to persist: AI variants if present, else the manual text. */
  function resolveCaptions(): PostCaptions {
    if (captions && Object.keys(captions).length) return captions;
    return captionsFromText(description, selected);
  }

  function validate(): string | null {
    if (!description.trim() && !(captions && Object.keys(captions).length)) {
      return "Write a caption first.";
    }
    if (selected.length === 0) return "Select at least one platform.";
    return null;
  }

  async function runAi(kind: "vision" | "enhance" | "variants") {
    setError(null);
    setBusy(kind);
    try {
      if (kind === "vision") {
        const { caption } = await visionCaption({ mediaUrl, hint: description });
        if (caption) setDescription(caption);
      } else if (kind === "enhance") {
        if (!description.trim()) {
          setError("Write something to enhance first.");
          return;
        }
        const { caption } = await enhanceCaption({ caption: description });
        if (caption) setDescription(caption);
      } else {
        if (!description.trim()) {
          setError("Add a short description first.");
          return;
        }
        if (selected.length === 0) {
          setError("Select at least one platform.");
          return;
        }
        const { captions: generated } = await generateCaptions({
          mediaUrl,
          userDescription: description,
          platforms: selected,
        });
        setCaptions(generated);
        setActiveTab(selected.find((p) => generated[p]) ?? selected[0]);
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : "AI request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveDraft() {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setBusy("draft");
    try {
      await createPost(supabase, orgId, {
        media_url: mediaUrl,
        user_description: description.trim() || null,
        captions: resolveCaptions(),
        platforms: selected,
        status: "draft",
        source,
        generation_id: generationId,
      });
      notify("Saved as draft.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmSchedule(iso: string) {
    setBusy("schedule");
    try {
      await createPost(supabase, orgId, {
        media_url: mediaUrl,
        user_description: description.trim() || null,
        captions: resolveCaptions(),
        platforms: selected,
        status: "scheduled",
        scheduled_at: iso,
        source,
        generation_id: generationId,
      });
      notify("Post scheduled.");
      setDialog(null);
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not schedule post.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmUpload() {
    setBusy("upload");
    try {
      const post = await createPost(supabase, orgId, {
        media_url: mediaUrl,
        user_description: description.trim() || null,
        captions: resolveCaptions(),
        platforms: selected,
        status: "draft",
        source,
        generation_id: generationId,
      });
      await publishPost({ postId: post.id });
      notify("Publishing…");
      setDialog(null);
      onDone();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not publish post.");
      setDialog(null);
    } finally {
      setBusy(null);
    }
  }

  function openAction(kind: "schedule" | "upload") {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setDialog(kind);
  }

  const activeCaption = captions?.[activeTab] ?? null;
  const busyAny = busy !== null;
  const captionPreview =
    resolveCaptions()[selected[0]]?.caption ?? description.trim();

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="post-description"
          className="mb-2 block text-sm font-semibold text-atmospheric-grey"
        >
          Caption
        </label>
        <textarea
          id="post-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Write your caption. Or describe the post and let AI write per-platform variants."
          className="glass-input min-h-[7rem] w-full resize-y px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {showVisionButton ? (
            <button
              type="button"
              onClick={() => void runAi("vision")}
              disabled={busyAny}
              className={SECONDARY_BTN}
            >
              {busy === "vision" ? (
                <Spinner className="h-4 w-4" label="Working" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Generate from image
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runAi("enhance")}
            disabled={busyAny || description.trim() === ""}
            className={SECONDARY_BTN}
          >
            {busy === "enhance" ? (
              <Spinner className="h-4 w-4" label="Working" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden />
            )}
            Enhance
          </button>
          <button
            type="button"
            onClick={() => void runAi("variants")}
            disabled={busyAny}
            className={SECONDARY_BTN}
          >
            {busy === "variants" ? (
              <Spinner className="h-4 w-4" label="Working" />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {captions ? "Regenerate variants" : "Generate per-platform variants"}
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-atmospheric-grey">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {POST_PLATFORMS.map((p) => {
            const isConnected = connectedSet.has(p);
            const isSelected = selected.includes(p);
            return (
              <FilterChip
                key={p}
                active={isSelected}
                onClick={() => togglePlatform(p)}
                className={cn(!isConnected && "cursor-not-allowed opacity-40")}
                title={isConnected ? undefined : `${PLATFORM_LABELS[p]} is not connected`}
              >
                <PlatformIcon platform={p} />
                {PLATFORM_LABELS[p]}
              </FilterChip>
            );
          })}
        </div>
        {!allConnected ? (
          <p className="mt-2 text-xs text-muted">
            Some platforms aren&apos;t connected.{" "}
            <Link
              href="/settings#social-posting"
              className="font-medium text-nexus-intake underline-offset-2 hover:underline"
            >
              Connect them in Settings
            </Link>
            .
          </p>
        ) : null}
      </div>

      {captions ? (
        <div className="app-glass-card rounded-xl p-4">
          <div className="flex flex-wrap gap-2 hairline-b pb-3">
            {selected.map((p) => (
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
                    {activeCaption.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
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
      ) : null}

      {error ? (
        <p className="border border-status-warning-border bg-status-warning-surface px-3 py-2 font-mono text-xs text-status-warning">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 hairline-t pt-5">
        <button type="button" onClick={() => void saveDraft()} disabled={busyAny} className={SECONDARY_BTN}>
          {busy === "draft" ? (
            <Spinner className="h-4 w-4" label="Saving" />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save as draft
        </button>
        <button type="button" onClick={() => openAction("schedule")} disabled={busyAny} className={SECONDARY_BTN}>
          <CalendarClock className="h-4 w-4" aria-hidden />
          Schedule
        </button>
        <button type="button" onClick={() => openAction("upload")} disabled={busyAny} className={PRIMARY_BTN}>
          <Send className="h-4 w-4" aria-hidden />
          Upload
        </button>
      </div>

      {dialog === "schedule" ? (
        <ScheduleDialog
          busy={busy === "schedule"}
          onConfirm={(iso) => void confirmSchedule(iso)}
          onCancel={() => setDialog(null)}
        />
      ) : null}
      {dialog === "upload" ? (
        <ConfirmPublishDialog
          platforms={selected}
          captionPreview={captionPreview}
          busy={busy === "upload"}
          onConfirm={() => void confirmUpload()}
          onCancel={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
