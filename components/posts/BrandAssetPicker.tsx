"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  BRAND_ASSETS_BUCKET,
  deleteBrandAsset,
  listBrandAssets,
  uploadBrandAsset,
} from "@/lib/posts/data";
import type { BrandAsset } from "@/lib/posts/types";
import { cn } from "@/lib/utils";
import { useSignedUrl } from "./shared";

function BrandAssetThumb({
  asset,
  selected,
  removing,
  onSelect,
  onRemove,
}: {
  asset: BrandAsset;
  selected: boolean;
  removing: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { url } = useSignedUrl(BRAND_ASSETS_BUCKET, asset.storage_path);
  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-xl border transition-colors",
        selected
          ? "border-nexus-approval ring-2 ring-nexus-approval"
          : "border-glass-border hover:border-nexus-approval-border",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={asset.name ?? "Brand asset"}
        className="block h-full w-full"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.name ?? "Brand asset"} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-surface-muted">
            <Spinner className="h-5 w-5" label="Loading asset" />
          </span>
        )}
      </button>
      {selected ? (
        <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-nexus-approval text-white">
          <Check className="h-3.5 w-3.5" aria-hidden />
        </span>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        aria-label="Remove brand asset"
        title="Remove from library"
        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-glass-border bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-status-critical focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-100"
      >
        {removing ? <Spinner className="h-3.5 w-3.5" label="Removing" /> : <X className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </div>
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
  const [removingId, setRemovingId] = useState<string | null>(null);

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

  async function handleRemove(asset: BrandAsset) {
    if (!window.confirm(`Remove "${asset.name ?? "this asset"}" from your brand library?`)) {
      return;
    }
    setRemovingId(asset.id);
    try {
      await deleteBrandAsset(supabase, orgId, asset);
      if (asset.id === selectedId) onSelect(null);
      await queryClient.invalidateQueries({ queryKey: ["brand-assets", orgId] });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not remove brand asset.");
    } finally {
      setRemovingId(null);
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
                removing={removingId === asset.id}
                onSelect={() =>
                  onSelect(asset.id === selectedId ? null : asset)
                }
                onRemove={() => void handleRemove(asset)}
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
        <p className="mt-3 text-xs text-muted">
          Using{" "}
          <span className="font-medium text-atmospheric-grey">
            {assets.find((a) => a.id === selectedId)?.name ?? "this asset"}
          </span>{" "}
          as a style reference for generation.
        </p>
      ) : null}
    </div>
  );
}
