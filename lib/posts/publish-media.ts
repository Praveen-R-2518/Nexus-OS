import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const POST_MEDIA_BUCKET = "post-media";

/** Instagram Graph needs a URL it can GET without extra headers. 24h covers container processing. */
const PUBLISH_SIGNED_TTL_SECONDS = 24 * 60 * 60;

/**
 * Turn a private `post-media` storage path into a time-limited HTTPS URL.
 * Returns null when the path is empty or signing fails — callers must fail closed.
 */
export async function signPostMediaUrl(
  supabase: SupabaseClient,
  storagePath: string | null | undefined,
): Promise<string | null> {
  const path = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data, error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .createSignedUrl(path, PUBLISH_SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
