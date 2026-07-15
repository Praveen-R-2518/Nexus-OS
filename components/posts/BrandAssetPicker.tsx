"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  BRAND_ASSETS_BUCKET,
  listBrandAssets,
  uploadBrandAsset,
} from "@/lib/posts/data";
import type { BrandAsset } from "@/lib/posts/types";
import { cn } from "@/lib/utils";
import { useSignedUrl } from "./shared";

function BrandAssetThumb({
  asset,
  selected,
  onSelect,
}: {
  asset: BrandAsset;
  selected: boolean;
  onSelect: () => void;
}) {
  const { url } = useSignedUrl(BRAND_ASSETS_BUCKET, asset.storage_path);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={asset.name ?? "Brand asset"}
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl border transition-colors",
        selected
          ? "border-nexus-approval ring-2 ring-nexus-approval"
          : "border-glass-border hover:border-nexus-approval-border",
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.name ?? "Brand asset"} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-surface-muted">
          <Spinner className="h-5 w-5" label="Loading asset" />
        </span>
      )}
      {selected ? (
        <span className="absolute right-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-nexus-approval text-white">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
    </button>
  );
}

interface BrandAssetPickerProps {
  orgId: string;
  selectedId: string | null;
  onSelect: (asset: BrandAsset | null) => void;
  notify: (msg: string) => void;
}

export function BrandAssetPicker({
  orgId,
  selectedId,
  onSelect,
  notify,
}: BrandAssetPickerProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: assets = [], isPending } = useQuery({
    queryKey: ["brand-assets", orgId],
    queryFn: () => listBrandAssets(supabase, orgId),
    enabled: !!orgId,
    staleTime: 30_000,
  });

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file.");
      return;
    }
    setUploading(true);
    try {
      const created = await uploadBrandAsset(supabase, orgId, file, {
        name: file.name,
        type: "brand_image",
      });
      await queryClient.invalidateQueries({ queryKey: ["brand-assets", orgId] });
      onSelect(created);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Brand asset upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-atmospheric-grey">
        Brand asset <span className="font-normal text-muted">(optional)</span>
      </p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-glass-border bg-glass/50 text-muted transition-colors hover:bg-glass disabled:cursor-not-allowed"
        >
          {uploading ? (
            <Spinner className="h-5 w-5" label="Uploading" />
          ) : (
            <>
              <Plus className="h-5 w-5" aria-hidden />
              <span className="text-xs font-medium">Upload new</span>
            </>
          )}
        </button>

        {isPending
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="glass-skeleton aspect-square animate-pulse rounded-xl" />
            ))
          : assets.map((asset) => (
              <BrandAssetThumb
                key={asset.id}
                asset={asset}
                selected={asset.id === selectedId}
                onSelect={() =>
                  onSelect(asset.id === selectedId ? null : asset)
                }
              />
            ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void handleUpload(e.target.files?.[0])}
      />

      {selectedId ? (
        <p className="mt-3 border border-status-caution-border bg-status-caution-surface px-3 py-2 text-xs text-status-caution">
          Reference-guided generation isn&apos;t live yet. The selected asset is
          saved to your library, but the image below is generated from your prompt
          only.
        </p>
      ) : null}
    </div>
  );
}
