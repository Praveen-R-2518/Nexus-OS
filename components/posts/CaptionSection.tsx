"use client";

import { useState } from "react";
import { ArrowRight, Sparkles, Wand2 } from "lucide-react";
import { FilterChip } from "@/components/ui/FilterChip";
import { Spinner } from "@/components/ui/Spinner";
import {
  enhanceCaptionStub,
  generateCaptions,
  visionCaptionStub,
} from "@/lib/posts/webhooks";
import { POST_PLATFORMS, PLATFORM_LABELS } from "@/lib/posts/types";
import type { Platform, SocialPost } from "@/lib/posts/types";
import { cn } from "@/lib/utils";
import { ComingSoonTag, PlatformIcon, PRIMARY_BTN, SECONDARY_BTN } from "./shared";

interface CaptionSectionProps {
  /** Storage path of the media this post is about (upload path or AI image). */
  mediaUrl: string;
  notify: (msg: string) => void;
  /** Fired the moment the draft row is created (for provenance linking). */
  onCreated?: (post: SocialPost) => void;
  /** Fired when the user is ready to move to Review. */
  onComplete: (post: SocialPost) => void;
  /** Vision captioning only makes sense with an image present. */
  showVisionButton?: boolean;
}

export function CaptionSection({
  mediaUrl,
  notify,
  onCreated,
  onComplete,
  showVisionButton = true,
}: CaptionSectionProps) {
  const [description, setDescription] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([...POST_PLATFORMS]);
  const [generating, setGenerating] = useState(false);
  const [stubBusy, setStubBusy] = useState<null | "vision" | "enhance">(null);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<SocialPost | null>(null);
  const [activeTab, setActiveTab] = useState<Platform>("instagram");

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  async function runStub(kind: "vision" | "enhance") {
    setStubBusy(kind);
    try {
      if (kind === "vision") {
        await visionCaptionStub({ mediaUrl });
      } else {
        await enhanceCaptionStub({ existingCaption: description });
      }
    } catch {
      notify("Not available yet.");
    } finally {
      setStubBusy(null);
    }
  }

  async function generateVariants() {
    const text = description.trim();
    if (!text) {
      setError("Add a short description of what this post is about first.");
      return;
    }
    if (platforms.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const created = await generateCaptions({
        mediaUrl,
        userDescription: text,
        platforms,
      });
      setPost(created);
      onCreated?.(created);
      const firstWithCaption =
        platforms.find((p) => created.captions?.[p]) ?? platforms[0];
      setActiveTab(firstWithCaption);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate captions.");
    } finally {
      setGenerating(false);
    }
  }

  const activeCaption = post?.captions?.[activeTab] ?? null;

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
          placeholder="Describe what this post is about. The AI writes per-platform variants from this."
          className="glass-input min-h-[7rem] w-full resize-y px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {showVisionButton ? (
            <button
              type="button"
              onClick={() => void runStub("vision")}
              disabled={stubBusy !== null}
              className={SECONDARY_BTN}
            >
              {stubBusy === "vision" ? (
                <Spinner className="h-4 w-4" label="Working" />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Generate from image
              <ComingSoonTag />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runStub("enhance")}
            disabled={stubBusy !== null || description.trim() === ""}
            className={SECONDARY_BTN}
          >
            {stubBusy === "enhance" ? (
              <Spinner className="h-4 w-4" label="Working" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden />
            )}
            Enhance
            <ComingSoonTag />
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-atmospheric-grey">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {POST_PLATFORMS.map((p) => {
            const selected = platforms.includes(p);
            return (
              <FilterChip
                key={p}
                active={selected}
                onClick={() => togglePlatform(p)}
              >
                <PlatformIcon platform={p} />
                {PLATFORM_LABELS[p]}
              </FilterChip>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="border border-status-warning-border bg-status-warning-surface px-3 py-2 font-mono text-xs text-status-warning">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void generateVariants()}
        disabled={generating}
        className={PRIMARY_BTN}
      >
        {generating ? (
          <Spinner className="h-4 w-4" label="Generating" />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
        {post ? "Regenerate variants" : "Generate per-platform variants"}
      </button>

      {post ? (
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
                    {activeCaption.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted">
                No caption returned for {PLATFORM_LABELS[activeTab]}.
              </p>
            )}
          </div>

          <div className="mt-4 flex justify-end hairline-b border-b-0 pt-2">
            <button
              type="button"
              onClick={() => onComplete(post)}
              className={PRIMARY_BTN}
            >
              Continue to review
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
