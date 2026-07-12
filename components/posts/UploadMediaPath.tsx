"use client";

/* Signed Supabase Storage URLs are dynamic; plain <img> is intentional. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState } from "react";
import { ImagePlus, UploadCloud } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { POST_MEDIA_BUCKET, uploadToBucket } from "@/lib/posts/data";
import type { SocialPost } from "@/lib/posts/types";
import { CaptionSection } from "./CaptionSection";
import { useSignedUrl } from "./shared";

interface UploadMediaPathProps {
  orgId: string;
  notify: (msg: string) => void;
  onComplete: (post: SocialPost) => void;
}

export function UploadMediaPath({ orgId, notify, onComplete }: UploadMediaPathProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { url: previewUrl } = useSignedUrl(POST_MEDIA_BUCKET, mediaPath);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const path = await uploadToBucket(supabase, POST_MEDIA_BUCKET, orgId, file);
      setMediaPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      {mediaPath ? (
        <div className="app-glass-card overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Uploaded media preview"
              className="max-h-80 w-full object-contain bg-black/5 dark:bg-white/5"
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-muted">
              <Spinner className="h-6 w-6" label="Loading preview" />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 hairline-b border-b-0 px-4 py-3">
            <span className="truncate text-sm text-muted">Media uploaded</span>
            <button
              type="button"
              onClick={() => {
                setMediaPath(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="text-sm font-medium text-nexus-intake transition-opacity hover:opacity-80"
            >
              Replace
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-glass-border bg-glass/50 px-8 py-14 text-center backdrop-blur-xl transition-colors hover:bg-glass disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Spinner className="h-8 w-8" label="Uploading" />
              <p className="text-sm text-muted">Uploading…</p>
            </>
          ) : (
            <>
              <span className="text-nexus-discovery">
                <UploadCloud className="h-9 w-9" aria-hidden />
              </span>
              <p className="nexus-section-title text-atmospheric-grey">
                Upload media
              </p>
              <p className="max-w-sm text-sm text-muted">
                Drop in an image or click to browse. It uploads privately to your
                organization&apos;s media library.
              </p>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      {error ? (
        <p className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical">
          {error}
        </p>
      ) : null}

      {mediaPath ? (
        <div className="hairline-t pt-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-atmospheric-grey">
            <ImagePlus className="h-4 w-4 text-nexus-discovery" aria-hidden />
            Write your caption
          </h3>
          <CaptionSection
            orgId={orgId}
            mediaUrl={mediaPath}
            notify={notify}
            onComplete={onComplete}
            showVisionButton
          />
        </div>
      ) : null}
    </div>
  );
}
