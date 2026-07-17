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
  "scheduled",
  "publishing",
  "published",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/**
 * Statuses shown as board filter chips. `publishing` is a transient state (a post
 * is only in it while WF8b talks to the platform APIs), so it is not a filter.
 */
export const BOARD_FILTER_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "failed",
] as const satisfies readonly PostStatus[];

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
  /** Set when the post is scheduled for a future publish; null otherwise. */
  scheduled_at: string | null;
  /** Reason the last publish attempt failed (shown on Failed cards). */
  publish_error: string | null;
  published_at: string | null;
  /** Audit trail (Task D.1) — stamped by schedulePost()/publish route, not a reviewer queue. */
  approval_status?: "draft" | "approved" | "rejected" | null;
  approved_at?: string | null;
  approved_by?: string | null;
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
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
};
