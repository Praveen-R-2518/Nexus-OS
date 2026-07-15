"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Mail, UserPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useOrganization } from "@/lib/auth/useOrganization";
import {
  INVITE_ROLES,
  buildInviteLink,
  createInvite,
  listInvites,
  type Invite,
  type InviteRole,
  type InviteStatus,
} from "@/lib/invites";
import { cn, formatRelativeTime } from "@/lib/utils";

const PRIMARY_BTN =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-2 text-[13px] font-medium text-nexus-approval transition-colors hover:bg-nexus-approval-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50";

const STATUS_STYLES: Record<InviteStatus, string> = {
  pending: "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  accepted: "border-nexus-growth-border bg-nexus-growth-soft text-status-positive",
  expired: "border-border-strong bg-surface-muted text-muted",
};

function StatusPill({ status }: { status: InviteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[1.5rem] items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
        STATUS_STYLES[status] ?? STATUS_STYLES.expired,
      )}
    >
      {status}
    </span>
  );
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(buildInviteLink(token));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — user can still select the text elsewhere */
    }
  }
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-nexus-intake transition-colors hover:bg-glass"
    >
      {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function InviteManager() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const queryClient = useQueryClient();
  const { organizationId, userId, loading, ready } = useOrganization();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<Invite | null>(null);

  const {
    data: invites = [],
    isPending,
    error: listError,
  } = useQuery({
    queryKey: ["invites", organizationId],
    queryFn: () => listInvites(supabase, organizationId as string),
    enabled: !!organizationId,
    staleTime: 15_000,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId) return;
    const trimmed = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await createInvite(supabase, {
        orgId: organizationId,
        email: trimmed,
        role,
        invitedBy: userId,
      });
      setLastInvite(created);
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["invites", organizationId] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the invite.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !ready) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading team" />
        <p className="text-sm">Loading team…</p>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Your account isn't linked to an organization yet, so team invites can't load. Finish onboarding first."
        icon={<UserPlus />}
        className="min-h-[50vh]"
      />
    );
  }

  const listErrorMsg = listError instanceof Error ? listError.message : null;

  return (
    <div className="min-h-0 space-y-10">
      <header className="hairline-b pb-8">
        <p className="nexus-meta text-nexus-approval">Settings</p>
        <h1 className="mt-3 nexus-app-title text-atmospheric-grey">Team</h1>
        <p className="mb-2 mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Invite teammates to your organization. Share the generated link. Anyone
          who signs up with it joins this organization automatically.
        </p>
      </header>

      <section aria-label="Invite a teammate" className="app-glass-card rounded-xl p-5 sm:p-6">
        <h2 className="nexus-section-title text-atmospheric-grey">Invite a teammate</h2>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1.5">
            <span className="block text-sm font-medium text-atmospheric-grey">Email</span>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                autoComplete="off"
                className="glass-input h-11 w-full pl-10 pr-3 text-sm text-atmospheric-grey outline-none transition placeholder:text-muted"
              />
            </div>
          </label>
          <label className="space-y-1.5 sm:w-40">
            <span className="block text-sm font-medium text-atmospheric-grey">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as InviteRole)}
              className="glass-input h-11 w-full cursor-pointer px-3 text-sm capitalize text-atmospheric-grey outline-none transition"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={submitting} className={PRIMARY_BTN}>
            {submitting ? (
              <Spinner className="h-4 w-4" label="Sending" />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden />
            )}
            Create invite
          </button>
        </form>

        {error ? (
          <p className="mt-3 border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical">
            {error}
          </p>
        ) : null}

        {lastInvite ? (
          <div className="mt-4 rounded-xl border border-nexus-growth-border bg-nexus-growth-soft px-4 py-3">
            <p className="text-sm font-medium text-status-positive">
              Invite created for {lastInvite.email}. Share this link (expires in 7 days):
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-glass px-3 py-2 font-mono text-xs text-atmospheric-grey">
                {buildInviteLink(lastInvite.token)}
              </code>
              <CopyLinkButton token={lastInvite.token} />
            </div>
          </div>
        ) : null}
      </section>

      <section aria-label="Existing invites" className="app-glass-card overflow-hidden rounded-xl">
        <div className="hairline-b px-5 py-4">
          <h2 className="text-sm font-semibold text-atmospheric-grey">Invites</h2>
        </div>

        {listErrorMsg ? (
          <p className="px-5 py-4 font-mono text-sm text-status-critical">{listErrorMsg}</p>
        ) : isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass-skeleton h-12 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : invites.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No invites yet. Invite your first teammate above.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Invited</th>
                  <th className="px-5 py-3 font-medium text-right">Link</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="hairline-t">
                    <td className="px-5 py-3 text-atmospheric-grey">{inv.email}</td>
                    <td className="px-5 py-3 capitalize text-muted">{inv.role}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={inv.status} />
                    </td>
                    <td className="px-5 py-3 tabular-nums text-muted">
                      {formatRelativeTime(inv.created_at)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {inv.status === "pending" ? (
                        <CopyLinkButton token={inv.token} />
                      ) : (
                        <span className="text-muted">n/a</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
