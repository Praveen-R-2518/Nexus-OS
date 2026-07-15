"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useOrganizationId } from "@/lib/posts/useOrganizationId";
import type { SocialPost } from "@/lib/posts/types";
import { Composer } from "./Composer";
import { PostStatusBoard } from "./PostStatusBoard";
import { ReviewSubmit } from "./ReviewSubmit";

type View =
  | { name: "board" }
  | { name: "composer" }
  | { name: "review"; post: SocialPost };

export function PostsWorkspace() {
  const { organizationId, ready, loading, error } = useOrganizationId();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>({ name: "board" });
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const refreshBoard = useCallback(() => {
    if (organizationId) {
      void queryClient.invalidateQueries({ queryKey: ["social-posts", organizationId] });
    }
  }, [queryClient, organizationId]);

  if (loading || !ready) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading posts" />
        <p className="text-sm">Loading posts…</p>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Couldn't load your workspace"
        description={error}
        icon={<ImageIcon />}
        className="min-h-[50vh]"
      />
    );
  }

  if (!organizationId) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Your account isn't linked to an organization yet, so posts can't load. Finish onboarding or contact your admin to set up your organization profile."
        icon={<ImageIcon />}
        className="min-h-[50vh]"
      />
    );
  }

  return (
    <div className="relative min-h-0">
      {view.name === "board" ? (
        <PostStatusBoard
          orgId={organizationId}
          onNewPost={() => setView({ name: "composer" })}
          onOpenPost={(post) => setView({ name: "review", post })}
        />
      ) : null}

      {view.name === "composer" ? (
        <Composer
          orgId={organizationId}
          notify={notify}
          onExit={() => setView({ name: "board" })}
          onSubmitted={() => {
            refreshBoard();
            setView({ name: "board" });
          }}
        />
      ) : null}

      {view.name === "review" ? (
        <div className="space-y-8">
          <header className="hairline-b pb-6">
            <button
              type="button"
              onClick={() => setView({ name: "board" })}
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-atmospheric-grey"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to posts
            </button>
            <p className="nexus-meta text-nexus-approval">Post</p>
            <h1 className="mt-3 nexus-app-title text-atmospheric-grey">Post detail</h1>
          </header>
          <ReviewSubmit
            orgId={organizationId}
            post={view.post}
            notify={notify}
            onDone={() => {
              refreshBoard();
              setView({ name: "board" });
            }}
          />
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-glass-border bg-glass px-4 py-2.5 text-sm font-medium text-atmospheric-grey shadow-lg backdrop-blur-xl"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
