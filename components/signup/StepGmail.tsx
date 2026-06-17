"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import FormInput from "@/components/signup/FormInput";
import type { SignupSnapshot } from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type StepGmailProps = {
  snapshot: SignupSnapshot;
  onComplete: (patch: { gmailConnected: boolean }) => void;
};

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-white dark:border-border dark:bg-surface-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-foreground"
      >
        {title}
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
        )}
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3 text-sm dark:border-border">{children}</div>
      ) : null}
    </div>
  );
}

export default function StepGmail({ snapshot, onComplete }: StepGmailProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [openA, setOpenA] = useState(true);
  const [openB, setOpenB] = useState(true);
  const [openC, setOpenC] = useState(true);
  const [chkA, setChkA] = useState(false);
  const [chkB, setChkB] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
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

  const sectionCVisible = chkA && chkB;

  async function testConnection() {
    if (!snapshot.workspaceId) return;
    setBusy(true);
    setBanner(null);
    const res = await fetch("/api/gmail/test-imap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: snapshot.workspaceId,
        email,
        username,
        password,
      }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string };
    setBusy(false);
    if (json.success) {
      setBanner({ type: "ok", text: "Gmail connected successfully!" });
      setTimeout(() => onComplete({ gmailConnected: true }), 800);
    } else {
      setBanner({
        type: "err",
        text: json.error || "Invalid credentials or IMAP not enabled",
      });
    }
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
        <h2 className="nexus-section-title text-foreground">Connect Gmail (IMAP)</h2>
        <p className="mt-1 text-base text-gray-500 dark:text-gray-400">
          Follow the steps, then test your credentials. You can skip and finish
          later.
        </p>
      </div>
      <Section title="Section A — Enable IMAP in Gmail" open={openA} onToggle={() => setOpenA((v) => !v)}>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-300">
          <li>Open gmail.com</li>
          <li>Settings (gear icon) → See all settings</li>
          <li>Tab: Forwarding and POP/IMAP</li>
          <li>Enable IMAP → Save Changes</li>
        </ol>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            className="h-4 w-4 border border-border bg-white text-nexus-approval focus:ring-1 focus:ring-nexus-approval dark:border-border dark:bg-surface-card dark:text-nexus-approval dark:focus:ring-nexus-approval"
            checked={chkA}
            onChange={(e) => setChkA(e.target.checked)}
          />
          <Check className="inline w-4 h-4 mr-1" /> I&apos;ve done this
        </label>
      </Section>
      <Section title="Section B — Create App Password" open={openB} onToggle={() => setOpenB((v) => !v)}>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-600 dark:text-gray-300">
          <li>Go to myaccount.google.com/security</li>
          <li>Enable 2-Step Verification if not already on</li>
          <li>Search &quot;App passwords&quot;</li>
          <li>
            When Google asks for a name, enter a short label (for example,{" "}
            <span className="font-medium text-foreground">NexusOS</span>). You only
            need this app name — you do not have to pick Mail, Other, or a specific
            device.
          </li>
          <li>Copy the 16-character password shown</li>
        </ol>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            className="h-4 w-4 border border-border bg-white text-nexus-approval focus:ring-1 focus:ring-nexus-approval dark:border-border dark:bg-surface-card dark:text-nexus-approval dark:focus:ring-nexus-approval"
            checked={chkB}
            onChange={(e) => setChkB(e.target.checked)}
          />
          <Check className="inline w-4 h-4 mr-1" /> I have my App Password
        </label>
      </Section>
      {sectionCVisible ? (
        <Section title="Section C — Connect your Gmail" open={openC} onToggle={() => setOpenC((v) => !v)}>
          <div className="space-y-4">
            <FormInput
              id="gmail-email"
              label="Gmail address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <FormInput
              id="gmail-user"
              label="IMAP username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <FormInput
              id="gmail-pass"
              label="App password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
              disabled={busy}
              onClick={testConnection}
              className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-nexus-approval bg-nexus-approval py-3 text-sm font-medium text-white transition hover:bg-[#2b82ff] disabled:opacity-50 dark:border-nexus-approval"
            >
              {busy ? "Testing…" : "Test Connection"}
            </button>
          </div>
        </Section>
      ) : (
        <p className="text-center text-sm text-atmospheric-grey/45">
          Complete Sections A and B to unlock the connection form.
        </p>
      )}
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
