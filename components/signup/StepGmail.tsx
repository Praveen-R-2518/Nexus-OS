"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import type { SignupSnapshot } from "@/components/signup/types";
import { authPrimaryButton } from "@/components/signup/authStyles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type StepGmailProps = {
  snapshot: SignupSnapshot;
  onComplete: (patch: { gmailConnected: boolean }) => void;
};

export default function StepGmail({ snapshot, onComplete }: StepGmailProps) {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [gmailChecking, setGmailChecking] = useState(true);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const em = data.user?.email ?? "";
      setEmail((e) => e || em);
      setUsername((u) => u || em);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function checkStatus() {
      if (searchParams.get("gmail_error") === "true") {
        setBanner({
          type: "err",
          text: "Gmail connection failed. Please try again.",
        });
      }

      try {
        const res = await fetch("/api/gmail/status");
        const data = (await res.json()) as {
          connected?: boolean;
          email?: string | null;
        };
        if (cancelled) return;

        if (data.connected === true) {
          setGmailConnected(true);
          setGmailEmail(data.email ?? null);
          setBanner({ type: "ok", text: "Gmail connected successfully!" });
          onComplete({ gmailConnected: true });
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setGmailChecking(false);
      }
    }

    void checkStatus();

    return () => {
      cancelled = true;
    };
  }, [searchParams, onComplete]);

  function handleGmailConnect() {
    window.location.href = "/api/gmail/connect";
  }

  async function skip() {
    if (!snapshot.workspaceId) return;
    setBusy(true);
    setBanner(null);
    const res = await fetch("/api/gmail/test-imap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: snapshot.workspaceId,
        skip: true,
        email,
        username,
      }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string };
    setBusy(false);
    if (!json.success) {
      setBanner({
        type: "err",
        text: json.error || "Could not save skip state",
      });
      return;
    }
    onComplete({ gmailConnected: false });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h2 className="nexus-section-title text-foreground">Connect Gmail</h2>
        <p className="mt-1 text-base text-gray-500 dark:text-gray-400">
          Connect your inbox by signing in with Google. You can skip and finish
          later.
        </p>
      </div>
      <div className="space-y-4">
        {banner ? (
          <div
            className={cn(
              "flex items-center rounded-xl border border-dashed px-3 py-2 text-sm",
              banner.type === "ok"
                ? "border-nexus-intake-border bg-nexus-intake-soft text-nexus-intake dark:border-nexus-intake-border dark:bg-nexus-intake-soft dark:text-nexus-intake"
                : "border-badge-critical-ring bg-badge-critical-bg text-badge-critical-text",
            )}
            role="status"
          >
            {banner.type === "ok" && <Check className="inline w-4 h-4 mr-1" />}
            {banner.text}
          </div>
        ) : null}
        <button
          type="button"
          disabled={busy || gmailChecking || gmailConnected}
          onClick={handleGmailConnect}
          className={authPrimaryButton}
        >
          {gmailChecking
            ? "Checking…"
            : gmailConnected && gmailEmail
              ? `Connected: ${gmailEmail}`
              : busy
                ? "Connecting…"
                : "Connect Gmail Account"}
        </button>
      </div>
      <div className="text-center">
        <button
          type="button"
          disabled={busy}
          onClick={skip}
          className="cursor-pointer text-sm font-medium text-gray-500 underline decoration-black/30 underline-offset-4 transition hover:text-gray-800 dark:text-gray-400 dark:decoration-white/30 dark:hover:text-gray-200"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
