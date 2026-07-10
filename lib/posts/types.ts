/**
 * Types for the Post unit (social publishing).
 *
 * Mirrors the live Supabase schema for `social_posts`, `post_generations`,
 * and `brand_assets`. Everything here is tenant-scoped by `organization_id`
 * and enforced by RLS (see the `org isolation` policies on each table).
 */

export const POST_PLATFORMS = ["instagram", "facebook", "x", "linkedin"] as const;
export type Platform = (typeof POST_PLATFORMS)[number];

export const POST_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "published",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export type PostSource = "upload" | "ai_generated";

/** Per-platform caption payload stored in `social_posts.captions` (jsonb). */
export interface PlatformCaption {
  caption: string;
  hashtags: string[];
}

export type PostCaptions = Partial<Record<Platform, PlatformCaption>>;

export interface SocialPost {
  id: string;
  organization_id: string | null;
  media_url: string;
  user_description: string | null;
  captions: PostCaptions | null;
  platforms: Platform[] | null;
  status: PostStatus;
  source: PostSource;
  generation_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostGeneration {
  id: string;
  organization_id: string;
  post_id: string | null;
  prompt: string;
  /** Storage path within the `post-media` bucket, e.g. `{org_id}/{filename}.png`. */
  image_url: string;
  parent_generation_id: string | null;
  model: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BrandAsset {
  id: string;
  organization_id: string;
  /** Storage path within the `brand-assets` bucket, e.g. `{org_id}/{filename}`. */
  storage_path: string;
  name: string | null;
  type: "logo" | "brand_image" | "other";
  created_by: string | null;
  created_at: string;
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  linkedin: "LinkedIn",
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  published: "Published",
  failed: "Failed",
};
