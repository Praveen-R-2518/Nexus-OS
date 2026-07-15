"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BrandAsset,
  Platform,
  PlatformCaption,
  PostCaptions,
  PostGeneration,
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

/** Mirror a single manual caption onto every selected platform. */
export function captionsFromText(
  text: string,
  platforms: Platform[],
): PostCaptions {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const entry: PlatformCaption = { caption: trimmed, hashtags: [] };
  const out: PostCaptions = {};
  for (const p of platforms) out[p] = entry;
  return out;
}

export interface PostDraftInput {
  media_url: string;
  user_description: string | null;
  captions: PostCaptions | null;
  platforms: Platform[];
  status: "draft" | "scheduled";
  scheduled_at?: string | null;
  source?: SocialPost["source"];
  generation_id?: string | null;
}

/**
 * Insert a new social post row directly (RLS-scoped, mirrors uploadBrandAsset).
 * This is how manual posts are created — no AI/webhook round-trip required.
 */
export async function createPost(
  supabase: SupabaseClient,
  orgId: string,
  input: PostDraftInput,
): Promise<SocialPost> {
  const { data, error } = await supabase
    .from("social_posts")
    .insert({
      organization_id: orgId,
      media_url: input.media_url,
      user_description: input.user_description,
      captions: input.captions,
      platforms: input.platforms,
      status: input.status,
      scheduled_at: input.scheduled_at ?? null,
      source: input.source ?? "upload",
      generation_id: input.generation_id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as SocialPost;
}

/** Fields an owner may edit on a draft/scheduled post from the detail view. */
export interface PostEditInput {
  user_description?: string | null;
  captions?: PostCaptions | null;
  platforms?: Platform[];
  status?: "draft" | "scheduled";
  scheduled_at?: string | null;
}

/**
 * Edit a draft/scheduled post. Never writes publishing/published/failed —
 * those are set only by the publish route / WF8b (via a service-role write).
 */
export async function updatePost(
  supabase: SupabaseClient,
  orgId: string,
  postId: string,
  patch: PostEditInput,
): Promise<void> {
  const { error } = await supabase
    .from("social_posts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("organization_id", orgId);
  if (error) throw error;
}

/** Delete a post row. Media objects are left in the bucket (cheap, org-scoped). */
export async function deletePost(
  supabase: SupabaseClient,
  orgId: string,
  postId: string,
): Promise<void> {
  const { error } = await supabase
    .from("social_posts")
    .delete()
    .eq("id", postId)
    .eq("organization_id", orgId);
  if (error) throw error;
}

/** Move a post to `scheduled` at the given ISO time. */
export async function schedulePost(
  supabase: SupabaseClient,
  orgId: string,
  postId: string,
  scheduledAtIso: string,
): Promise<void> {
  await updatePost(supabase, orgId, postId, {
    status: "scheduled",
    scheduled_at: scheduledAtIso,
  });
}

/** Return a scheduled post to `draft` and clear its scheduled time. */
export async function unschedulePost(
  supabase: SupabaseClient,
  orgId: string,
  postId: string,
): Promise<void> {
  await updatePost(supabase, orgId, postId, {
    status: "draft",
    scheduled_at: null,
  });
}

/**
 * Platforms this org has connected for publishing (from social_credentials).
 * Drives composer gating — you can only schedule/publish to connected platforms.
 */
export async function listConnectedPlatforms(
  supabase: SupabaseClient,
  orgId: string,
): Promise<Platform[]> {
  const { data, error } = await supabase
    .from("social_credentials")
    .select("platform")
    .eq("organization_id", orgId);
  if (error) throw error;
  return (data ?? [])
    .map((row) => (row as { platform?: unknown }).platform)
    .filter((p): p is Platform => typeof p === "string") as Platform[];
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

/**
 * Remove a brand asset: delete the stored object, then the row. Storage RLS
 * (see the storage-buckets migration) already scopes deletes to the org.
 * Best-effort on the object so a missing file never strands the row.
 */
export async function deleteBrandAsset(
  supabase: SupabaseClient,
  orgId: string,
  asset: Pick<BrandAsset, "id" | "storage_path">,
): Promise<void> {
  if (asset.storage_path) {
    await supabase.storage.from(BRAND_ASSETS_BUCKET).remove([asset.storage_path]);
  }
  const { error } = await supabase
    .from("brand_assets")
    .delete()
    .eq("id", asset.id)
    .eq("organization_id", orgId);
  if (error) throw error;
}
