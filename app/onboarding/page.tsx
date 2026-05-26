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
    const { data, error: rpcError } = await supabase.rpc("launch_workspace", {
      company_name: name,
      invite_emails: inviteEmails,
      workspace_type: "solo",
      industry: "Technology",
      company_size: "Just me",
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message || "Could not launch workspace.");
      return;
    }
    const row = data as { team_id?: string; workspace_id?: string } | null;
    if (!row?.workspace_id) {
      setError("Unexpected response from server.");
      return;
    }
    await refetchProfile();
    router.refresh();
    router.push("/dashboard");
  }

  return (
    <div className="ae-onboarding-bg flex min-h-[100dvh] items-center justify-center px-4 py-12">
      <div
        className={cn(
          "ae-glass-card w-full max-w-md animate-fade-up p-8 sm:p-10",
          "font-[family-name:var(--font-ae-sans),system-ui,sans-serif]",
        )}
      >
        <p className="mb-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.35em] text-white/55">
          Nexus OS
        </p>
        <h1 className="text-center text-2xl font-bold uppercase tracking-tightest text-white sm:text-3xl">
          Initialize workspace
        </h1>
        <p className="mt-3 text-center font-mono text-xs leading-relaxed text-white/60">
          Bind your company to a secure tenant. You can invite teammates now or later.
        </p>

        <form onSubmit={(ev) => void onSubmit(ev)} className="mt-10 space-y-6">
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/80">
              Company / workspace name
            </span>
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="ae-input w-full px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/35"
              placeholder="Acme Revenue Ops"
              autoComplete="organization"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/80">
              Invite team members{" "}
              <span className="font-normal normal-case text-white/45">(optional)</span>
            </span>
            <textarea
              value={inviteRaw}
              onChange={(e) => setInviteRaw(e.target.value)}
              rows={4}
              className="ae-input w-full resize-y px-4 py-3 font-mono text-xs text-white outline-none transition placeholder:text-white/35"
              placeholder="comma@company.com, other@company.com"
            />
          </label>

          {error ? (
            <p
              className="border border-dashed border-red-400/40 bg-red-950/30 px-3 py-2 font-mono text-xs text-red-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className={cn(
              "ae-cta w-full py-3.5 text-center text-sm font-bold uppercase tracking-widest text-white transition",
              busy && "pointer-events-none opacity-70",
            )}
          >
            {busy ? "Launching…" : "Launch workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
