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

// Reason codes emitted by app/api/gmail/callback/handler.ts via ?gmail_error=<code>
const GMAIL_ERROR_MESSAGES: Record<string, string> = {
  parse_params: "Could not read Google's response. Please try again.",
  missing_params: "Google did not return an authorization code. Please try again.",
  invalid_state: "The connection request expired or was tampered with. Please try again.",
  supabase_init: "Server error while connecting. Please try again.",
  auth_user_mismatch:
    "A different account is signed in than the one that started the connection. Sign back in and retry.",
  workspace_lookup: "Could not verify your workspace. Please try again.",
  workspace_forbidden: "This workspace does not belong to your account.",
  oauth_config: "Gmail connection is not configured on the server yet.",
  token_exchange: "Google rejected the authorization. Please try again.",
  token_invalid_grant:
    "That authorization was already used or expired. Click Connect to start again.",
  userinfo_fetch: "Could not read your Gmail address from Google. Please try again.",
  userinfo_missing_email: "Google did not share an email address for this account.",
  encrypt: "Server error while securing your credentials. Please try again.",
  upsert_gmail_credentials: "Could not save your Gmail connection. Please try again.",
};

const STATUS_POLL_INTERVAL_MS = 2000;
const STATUS_POLL_MAX_ATTEMPTS = 30;

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
    let timer: ReturnType<typeof setTimeout> | null = null;

    const errorCode = searchParams.get("gmail_error");
    if (errorCode) {
      setBanner({
        type: "err",
        text:
          GMAIL_ERROR_MESSAGES[errorCode] ??
          "Gmail connection failed. Please try again.",
      });
    }

    // Keep polling after the OAuth redirect: the credential write can land a
    // moment after we return, and a flaky redirect chain (Safari) may drop the
    // ?gmail_connected param entirely — the status endpoint is the truth.
    const shouldPoll =
      searchParams.get("gmail_connected") === "true" && !errorCode;

    async function checkStatus(attempt: number) {
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
          return;
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setGmailChecking(false);
      }

      if (!cancelled && shouldPoll && attempt < STATUS_POLL_MAX_ATTEMPTS) {
        timer = setTimeout(
          () => void checkStatus(attempt + 1),
          STATUS_POLL_INTERVAL_MS,
        );
      }
    }

    void checkStatus(0);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
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
