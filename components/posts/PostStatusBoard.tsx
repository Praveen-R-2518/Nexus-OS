"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { listPosts } from "@/lib/posts/data";
import { POST_STATUSES, STATUS_LABELS } from "@/lib/posts/types";
import type { PostStatus, SocialPost } from "@/lib/posts/types";
import { PostCard } from "./PostCard";
import { PRIMARY_BTN } from "./shared";

type Filter = "all" | PostStatus;

interface PostStatusBoardProps {
  orgId: string;
  onNewPost: () => void;
  onOpenPost: (post: SocialPost) => void;
}

export function PostStatusBoard({ orgId, onNewPost, onOpenPost }: PostStatusBoardProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [filter, setFilter] = useState<Filter>("all");

  const {
    data: posts = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ["social-posts", orgId],
    queryFn: () => listPosts(supabase, orgId),
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: posts.length };
    for (const s of POST_STATUSES) c[s] = 0;
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [posts]);

  const visible = useMemo(
    () => (filter === "all" ? posts : posts.filter((p) => p.status === filter)),
    [posts, filter],
  );

  const filters: Filter[] = ["all", ...POST_STATUSES];
  const errorMsg = error instanceof Error ? error.message : null;

  return (
    <div className="min-h-0 space-y-8">
      <header className="hairline-b pb-8">
        <p className="nexus-meta text-nexus-approval">Content</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="nexus-app-title text-atmospheric-grey">Posts</h1>
            <p className="mb-2 mt-4 max-w-2xl text-base leading-relaxed text-muted">
              Draft, caption, and route social posts through the approval queue
              before they go live.
            </p>
          </div>
          <button type="button" onClick={onNewPost} className={PRIMARY_BTN}>
            <Plus className="h-4 w-4" aria-hidden />
            New Post
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <FilterChip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
            className="min-h-9 rounded-full py-1.5"
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
            <span className="tabular-nums opacity-70">{counts[f] ?? 0}</span>
          </FilterChip>
        ))}
      </div>

      {errorMsg ? (
        <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
          <span>Posts: {errorMsg}</span>{" "}
          <button
            type="button"
            onClick={() => void refetch()}
            className="ml-2 cursor-pointer font-semibold uppercase tracking-wide text-status-positive underline-offset-4 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isPending ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-skeleton aspect-[4/3] animate-pulse rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No posts yet" : `No ${STATUS_LABELS[filter]} posts`}
          description={
            filter === "all"
              ? "Create your first post to get started."
              : "Nothing in this stage right now."
          }
          icon={<ImageIcon />}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((post) => (
            <PostCard key={post.id} post={post} onOpen={onOpenPost} />
          ))}
        </div>
      )}
    </div>
  );
}
