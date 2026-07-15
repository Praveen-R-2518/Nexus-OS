"use client";

/* Signed Supabase Storage URLs are dynamic; next/image needs remotePatterns
   config this repo doesn't set, so plain <img> is intentional here. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { ArrowLeft, ImagePlus, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  POST_MEDIA_BUCKET,
  getGeneration,
  linkGenerationToPost,
  signStoragePath,
} from "@/lib/posts/data";
import {
  editImageStub,
  generatePostImage,
} from "@/lib/posts/webhooks";
import type { BrandAsset, SocialPost } from "@/lib/posts/types";
import { BrandAssetPicker } from "./BrandAssetPicker";
import { CaptionSection } from "./CaptionSection";
import { PRIMARY_BTN, SECONDARY_BTN } from "./shared";

interface CreateWithAiPathProps {
  orgId: string;
  notify: (msg: string) => void;
  onComplete: (post: SocialPost) => void;
}

/** The AI image currently on screen; drives Undo (via parent_generation_id). */
interface CurrentGen {
  id: string;
  imagePath: string;
  signedUrl: string | null;
  prompt: string;
  /** Known parent id — enables Undo; the authoritative walk re-reads the DB. */
  parentId: string | null;
}

export function CreateWithAiPath({ orgId, notify, onComplete }: CreateWithAiPathProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [prompt, setPrompt] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<BrandAsset | null>(null);
  const [generating, setGenerating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gen, setGen] = useState<CurrentGen | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function runGenerate(parentGenerationId: string | null) {
    const text = prompt.trim();
    if (!text) {
      setError("Describe the image you want to generate.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const result = await generatePostImage({ prompt: text, parentGenerationId });
      setGen({
        id: result.generation_id,
        imagePath: result.image_path,
        signedUrl: result.signed_url,
        prompt: result.enhanced_prompt || text,
        parentId: parentGenerationId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  /** Walk `parent_generation_id` back one step (plain Supabase select). */
  async function undo() {
    if (!gen?.parentId) return;
    setUndoing(true);
    setError(null);
    try {
      const parent = await getGeneration(supabase, orgId, gen.parentId);
      if (!parent) {
        notify("Previous image is no longer available.");
        return;
      }
      const signed = await signStoragePath(supabase, POST_MEDIA_BUCKET, parent.image_url);
      setGen({
        id: parent.id,
        imagePath: parent.image_url,
        signedUrl: signed,
        prompt: parent.prompt,
        parentId: parent.parent_generation_id,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not undo.");
    } finally {
      setUndoing(false);
    }
  }

  async function edit() {
    if (!gen) return;
    setEditBusy(true);
    try {
      await editImageStub({ editOf: gen.id, editInstruction: "" });
    } catch {
      notify("Not available yet.");
    } finally {
      setEditBusy(false);
    }
  }

  async function handleCreated(post: SocialPost) {
    if (!gen) return;
    // Reconcile provenance: the caption webhook creates the row as an upload.
    try {
      await linkGenerationToPost(supabase, orgId, post.id, gen.id);
    } catch {
      // Provenance is non-blocking; the draft is already valid.
    }
  }

  if (accepted && gen) {
    return (
      <div className="space-y-6">
        <div className="app-glass-card overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {gen.signedUrl ? (
            <img
              src={gen.signedUrl}
              alt="Selected AI image"
              className="max-h-72 w-full object-contain bg-black/5 dark:bg-white/5"
            />
          ) : null}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate text-sm text-muted">Using this image</span>
            <button
              type="button"
              onClick={() => setAccepted(false)}
              className="inline-flex items-center gap-1 text-sm font-medium text-nexus-intake transition-opacity hover:opacity-80"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to image
            </button>
          </div>
        </div>

        <div className="hairline-t pt-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-atmospheric-grey">
            <ImagePlus className="h-4 w-4 text-nexus-discovery" aria-hidden />
            Write your caption
          </h3>
          <CaptionSection
            mediaUrl={gen.imagePath}
            notify={notify}
            onCreated={handleCreated}
            onComplete={onComplete}
            showVisionButton
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <label
          htmlFor="ai-prompt"
          className="mb-2 block text-sm font-semibold text-atmospheric-grey"
        >
          Image prompt
        </label>
        <textarea
          id="ai-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Describe the image you want. The prompt is AI-enhanced before generation."
          className="glass-input min-h-[6rem] w-full resize-y px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted"
        />
      </div>

      <BrandAssetPicker
        orgId={orgId}
        selectedId={selectedAsset?.id ?? null}
        onSelect={setSelectedAsset}
        notify={notify}
      />

      {error ? (
        <p className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical">
          {error}
        </p>
      ) : null}

      {!gen ? (
        <button
          type="button"
          onClick={() => void runGenerate(null)}
          disabled={generating}
          className={PRIMARY_BTN}
        >
          {generating ? (
            <Spinner className="h-4 w-4" label="Generating" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          Generate
        </button>
      ) : (
        <div className="app-glass-card overflow-hidden rounded-xl">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {gen.signedUrl ? (
              <img
                src={gen.signedUrl}
                alt="Generated AI image"
                className="max-h-80 w-full object-contain bg-black/5 dark:bg-white/5"
              />
            ) : (
              <div className="flex h-56 items-center justify-center text-muted">
                <Spinner className="h-6 w-6" label="Loading image" />
              </div>
            )}
            {(generating || undoing) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                <Spinner className="h-8 w-8" label="Working" />
              </div>
            )}
          </div>

          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void undo()}
                disabled={!gen.parentId || undoing || generating}
                className={SECONDARY_BTN}
                title={gen.parentId ? "Revert to the previous image" : "No previous image"}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden /> Undo
              </button>
              <button
                type="button"
                onClick={() => void runGenerate(gen.id)}
                disabled={generating || undoing}
                className={SECONDARY_BTN}
              >
                <RefreshCw className="h-4 w-4" aria-hidden /> Regenerate
              </button>
              <button
                type="button"
                onClick={() => void edit()}
                disabled={editBusy}
                className={SECONDARY_BTN}
              >
                <Pencil className="h-4 w-4" aria-hidden /> Edit
                <span className="ml-1 inline-flex items-center rounded-full border border-border-strong bg-surface-muted px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Coming soon
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setAccepted(true)}
              className={PRIMARY_BTN}
            >
              Use this image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
