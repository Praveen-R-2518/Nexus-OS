import { NextResponse } from "next/server";
import { rateLimitDurable, requireN8nJobOrBootstrapToken } from "@/lib/api-security";
import { composeCaptionWithHashtags } from "@/lib/posts/caption-text";
import { signPostMediaUrl } from "@/lib/posts/publish-media";
import type { Platform, PostCaptions } from "@/lib/posts/types";
import { createServerClient } from "@/lib/supabase";
import { parseWorkspaceId } from "@/lib/workspace-id";

export const dynamic = "force-dynamic";

/**
 * GET /api/internal/n8n/social-post?organization_id=&post_id=
 *
 * WF8b reads the post (and a signed media URL) from the app instead of Supabase REST.
 * Job-token or bootstrap/ingest fallback, same pattern as social-credentials.
 */
export async function GET(request: Request) {
  const limited = await rateLimitDurable(
    request,
    "api:internal:n8n:social-post",
    60,
    60_000,
  );
  if (limited) return limited;

  const url = new URL(request.url);
  const organizationId = parseWorkspaceId(url.searchParams.get("organization_id"));
  const postId = parseWorkspaceId(url.searchParams.get("post_id"));
  if (!organizationId || !postId) {
    return NextResponse.json(
      {
        success: false,
        error: "organization_id and post_id are required and must be valid UUIDs",
      },
      { status: 400 },
    );
  }

  const unauthorized = await requireN8nJobOrBootstrapToken(
    request,
    "read_social_post",
    { resourceType: "post", resourceId: postId },
    "internal n8n social-post GET",
  );
  if (unauthorized) return unauthorized;

  let supabase;
  try {
    supabase = createServerClient();
  } catch {
    return NextResponse.json(
      { success: false, error: "Server configuration error" },
      { status: 500 },
    );
  }

  const { data: row, error } = await supabase
    .from("social_posts")
    .select(
      "id, organization_id, platforms, captions, media_url, user_description, status",
    )
    .eq("id", postId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[internal n8n social-post] Supabase error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load social post" },
      { status: 502 },
    );
  }
  if (!row) {
    return NextResponse.json(
      { success: false, error: "Post not found" },
      { status: 404 },
    );
  }

  const captions = (row.captions ?? {}) as PostCaptions;
  const platforms = ((row.platforms ?? []) as Platform[]) ?? [];
  const composed: Record<string, string> = {};
  for (const platform of platforms) {
    const entry = captions[platform];
    composed[platform] = composeCaptionWithHashtags(
      entry?.caption ?? row.user_description ?? "",
      entry?.hashtags,
    );
  }

  const mediaSignedUrl = await signPostMediaUrl(supabase, row.media_url);
  if (!mediaSignedUrl) {
    return NextResponse.json(
      { success: false, error: "Could not sign post media for publishing" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: row.id,
      organization_id: row.organization_id,
      platforms,
      captions,
      composed_captions: composed,
      media_url: row.media_url,
      media_signed_url: mediaSignedUrl,
      user_description: row.user_description,
      status: row.status,
    },
  });
}
