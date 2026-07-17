"use client";

import { ImageIcon } from "lucide-react";
import { POST_MEDIA_BUCKET } from "@/lib/posts/data";
import { POST_PLATFORMS } from "@/lib/posts/types";
import type { Platform, SocialPost } from "@/lib/posts/types";
import { formatRelativeTime } from "@/lib/utils";
import { PlatformIcon, StatusBadge, useSignedUrl } from "./shared";

function captionExcerpt(post: SocialPost): string {
  const captions = post.captions ?? {};
  for (const p of POST_PLATFORMS) {
    const c = captions[p]?.caption?.trim();
    if (c) return c;
  }
  return post.user_description?.trim() || "No caption yet";
}

export function PostCard({
  post,
  onOpen,
}: {
  post: SocialPost;
  onOpen: (post: SocialPost) => void;
}) {
  const { url } = useSignedUrl(POST_MEDIA_BUCKET, post.media_url);
  const platforms = (post.platforms ?? []) as Platform[];

  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className="app-glass-card group flex flex-col overflow-hidden rounded-xl text-left transition-colors hover:border-nexus-approval-border"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-black/5 dark:bg-white/5">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted">
            <ImageIcon className="h-8 w-8" aria-hidden />
          </span>
        )}
        <span className="absolute left-2 top-2">
          <StatusBadge status={post.status} />
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="line-clamp-2 text-sm leading-relaxed text-atmospheric-grey">
          {captionExcerpt(post)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-muted">
            {platforms.length ? (
              platforms.map((p) => <PlatformIcon key={p} platform={p} />)
            ) : (
              <span className="text-xs">No platforms</span>
            )}
          </div>
          {post.status === "scheduled" && post.scheduled_at ? (
            <time
              className="text-xs tabular-nums text-nexus-approval"
              dateTime={post.scheduled_at}
            >
              Scheduled · {formatRelativeTime(post.scheduled_at)}
            </time>
          ) : (
            <time className="text-xs tabular-nums text-muted" dateTime={post.updated_at}>
              {formatRelativeTime(post.updated_at)}
            </time>
          )}
        </div>
      </div>
    </button>
  );
}
