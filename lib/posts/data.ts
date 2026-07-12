"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrandAsset,
  PostGeneration,
  PostStatus,
  SocialPost,
} from "./types";

export const POST_MEDIA_BUCKET = "post-media";
export const BRAND_ASSETS_BUCKET = "brand-assets";

/** Signed URLs are short-lived; re-sign on display rather than caching. */
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h — plenty for a page view

/** Keep a file extension (lowercased) from a filename, defaulting to png. */
function extensionOf(fileName: string, fallback = "png"): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0 || dot === fileName.length - 1) return fallback;
  return fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") || fallback;
}

/**
 * Build a storage object path. RLS on `storage.objects` requires the first
 * path segment to equal the caller's organization_id, so we always prefix it.
 */
export function buildStoragePath(orgId: string, fileName: string): string {
  const ext = extensionOf(fileName);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${orgId}/${id}.${ext}`;
}

/** Sign a storage path for display. Returns null if the object can't be signed. */
export async function signStoragePath(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Upload a file to a private bucket at `{orgId}/{uuid}.{ext}`.
 * Returns the storage path (NOT a URL) — that is what the DB / webhooks store.
 */
export async function uploadToBucket(
  supabase: SupabaseClient,
  bucket: string,
  orgId: string,
  file: File,
): Promise<string> {
  const path = buildStoragePath(orgId, file.name);
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;
  return path;
}

// ---------------------------------------------------------------------------
// social_posts
// ---------------------------------------------------------------------------

export async function listPosts(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SocialPost[]> {
  const { data, error } = await supabase
    .from("social_posts")
    .select("*")
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SocialPost[];
}

/**
 * Plain status transition. Only the client-safe transitions are allowed here;
 * `published` is set externally by WF8b and must never be written from the UI.
 */
export async function updatePostStatus(
  supabase: SupabaseClient,
  orgId: string,
  postId: string,
  status: Exclude<PostStatus, "published" | "failed">,
): Promise<void> {
  const { error } = await supabase
    .from("social_posts")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("organization_id", orgId);
  if (error) throw error;
}

/**
 * Link a draft row to the AI generation it came from and mark its source.
 * The `social-post-input` webhook creates the row with the default
 * `source = 'upload'` and no generation link, so the AI path reconciles
 * provenance here. Best-effort: provenance shouldn't block the draft.
 */
export async function linkGenerationToPost(
  supabase: SupabaseClient,
  orgId: string,
  postId: string,
  generationId: string,
): Promise<void> {
  const { error } = await supabase
    .from("social_posts")
    .update({
      source: "ai_generated",
      generation_id: generationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)
    .eq("organization_id", orgId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// post_generations (undo history)
// ---------------------------------------------------------------------------

export async function getGeneration(
  supabase: SupabaseClient,
  orgId: string,
  generationId: string,
): Promise<PostGeneration | null> {
  const { data, error } = await supabase
    .from("post_generations")
    .select("*")
    .eq("id", generationId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (data as PostGeneration | null) ?? null;
}

// ---------------------------------------------------------------------------
// brand_assets
// ---------------------------------------------------------------------------

export async function listBrandAssets(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BrandAsset[]> {
  const { data, error } = await supabase
    .from("brand_assets")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BrandAsset[];
}

/**
 * Upload a brand asset to the `brand-assets` bucket and record it. No webhook —
 * this is a pure client-side Supabase flow against RLS-protected resources.
 */
export async function uploadBrandAsset(
  supabase: SupabaseClient,
  orgId: string,
  file: File,
  meta: { name: string; type: BrandAsset["type"] },
): Promise<BrandAsset> {
  const storagePath = await uploadToBucket(supabase, BRAND_ASSETS_BUCKET, orgId, file);
  const { data, error } = await supabase
    .from("brand_assets")
    .insert({
      organization_id: orgId,
      storage_path: storagePath,
      name: meta.name || file.name,
      type: meta.type,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as BrandAsset;
}
