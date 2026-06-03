"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthGuard } from "@/components/auth/AuthGuard";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

function parseInviteEmails(raw: string): string[] {
  const parts = raw.split(/[\n,;]+/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const e = p.trim().toLowerCase();
    if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

type LaunchWorkspaceResponse = {
  workspace_id?: unknown;
};

function parseWorkspaceId(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const raw = (data as LaunchWorkspaceResponse).workspace_id;
    return typeof raw === "string" && raw.trim() ? raw : undefined;
  }
  return undefined;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { refetchProfile } = useAuthGuard();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [companyName, setCompanyName] = useState("");
  const [inviteRaw, setInviteRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const name = companyName.trim();
    if (!name) {
      setError("Company / workspace name is required.");
      return;
    }
    setBusy(true);
    const inviteEmails = parseInviteEmails(inviteRaw);
    const isTeam = inviteEmails.length > 0;
    const { data, error: rpcError } = await supabase.rpc("launch_workspace", {
      company_name: name,
      invite_emails: inviteEmails,
      workspace_type: isTeam ? "team" : "solo",
      industry: "Technology",
      company_size: isTeam ? String(inviteEmails.length + 1) : "Just me",
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message || "Could not launch workspace.");
      return;
    }
    const wid = parseWorkspaceId(data);

    if (!wid) {
      setError("Unexpected response from server.");
      return;
    }
    await refetchProfile();
    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="w-full max-w-md mx-auto rounded-[2rem] border border-border bg-white p-8 md:p-10 shadow-2xl dark:border-white/10 dark:bg-[#161616]">
      <div className="mb-6 border-b border-dashed border-border pb-6 dark:border-border">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-ref-cta dark:text-muted">
          [ ONBOARD / WORKSPACE ]
        </p>
        <h1 className="mt-4 font-sans text-2xl font-black uppercase tracking-tight text-black dark:text-white">
          Initialize workspace
        </h1>
        <p className="mt-3 font-mono text-xs leading-relaxed text-black/90 dark:text-white/90">
          Bind your company to a secure tenant. You can invite teammates now or later.
        </p>
      </div>

      <form onSubmit={(ev) => void onSubmit(ev)} className="space-y-5">
        <label className="block space-y-2">
          <span className="font-mono text-xs uppercase tracking-widest text-black/95 dark:text-white/95">
            Company / workspace name
          </span>
          <input
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-white px-3 font-mono text-sm text-black outline-none transition placeholder:text-black/55 focus:border-[#0f2336] focus:ring-1 focus:ring-[#0f2336] dark:border-border dark:bg-surface-card dark:text-white dark:placeholder:text-white/55 dark:focus:border-border-strong dark:focus:ring-border-strong"
            placeholder="Acme Revenue Ops"
            autoComplete="organization"
          />
        </label>

        <label className="block space-y-2">
          <span className="font-mono text-xs uppercase tracking-widest text-black/95 dark:text-white/95">
            Invite team members{" "}
            <span className="font-normal normal-case text-black/55 dark:text-white/55">(optional)</span>
          </span>
          <textarea
            value={inviteRaw}
            onChange={(e) => setInviteRaw(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-border bg-white p-3 font-mono text-xs text-black outline-none transition placeholder:text-black/55 focus:border-[#0f2336] focus:ring-1 focus:ring-[#0f2336] dark:border-border dark:bg-surface-card dark:text-white dark:placeholder:text-white/55 dark:focus:border-border-strong dark:focus:ring-border-strong"
            placeholder="comma@company.com, other@company.com"
          />
        </label>

        {error ? (
          <p
            className="border border-dashed border-red-500/30 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-600 dark:text-red-400"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className={cn(
            "inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-[#0f2336] py-3.5 font-mono text-xs font-semibold uppercase tracking-widest text-white transition hover:bg-[#172f45] disabled:opacity-50 dark:border-border dark:bg-surface-elevated dark:hover:bg-white/5",
            busy && "pointer-events-none opacity-70",
          )}
        >
          {busy ? "Launching…" : "Launch workspace"}
        </button>
      </form>
    </div>
  );
}
