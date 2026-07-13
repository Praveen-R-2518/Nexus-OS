"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Lock,
  Mail,
  MessageCircle,
  MessagesSquare,
  Camera,
  Shield,
  Sparkles,
} from "lucide-react";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
import {
  planTierToSlug,
  PRICING_TIERS,
  type PricingPlanSlug,
} from "@/lib/pricing/plans";
import { settingsQuery, updateSettingsMutation } from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import type { MetaChannelPlatform } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const INPUT_CLASS =
  "w-full rounded-xl border border-glass-border bg-glass px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-60";

const PRIMARY_BTN =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-2 text-[13px] font-medium text-nexus-approval transition-colors hover:bg-nexus-approval-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_BTN =
  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-glass-border bg-glass px-3 py-2 text-sm font-medium text-atmospheric-grey transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50";

const META_LABELS: Record<MetaChannelPlatform, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram DMs",
  facebook: "Facebook Messenger",
};

function planTitle(planTier: string | null): string {
  const slug = planTierToSlug(
    planTier === "pro" || planTier === "team"
      ? "pro"
      : planTier === "enterprise"
        ? "enterprise"
        : "starter",
  );
  return PRICING_TIERS.find((tier) => tier.slug === slug)?.title ?? "Starter";
}

function planPricingCopy(slug: PricingPlanSlug): string {
  const tier = PRICING_TIERS.find((item) => item.slug === slug);
  if (!tier || tier.monthlyPrice === null) return "Contact sales for custom pricing.";
  return `$${tier.monthlyPrice}/month · overages at $20 per 1,000 messages`;
}

function StatusPill({
  connected,
  label,
}: {
  connected: boolean;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[1.5rem] items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        connected
          ? "border-nexus-growth-border bg-nexus-growth-soft text-status-positive"
          : "border-border-strong bg-surface-muted text-muted",
      )}
    >
      {label}
    </span>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-atmospheric-grey">{label}</span>
      {hint ? <span className="block text-xs text-muted">{hint}</span> : null}
      {children}
    </label>
  );
}

function PlaceholderToggle({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-dashed border-glass-border px-4 py-3">
      <div>
        <p className="text-sm font-medium text-atmospheric-grey">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full bg-surface-muted opacity-60"
        title="Coming soon"
      >
        <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow" />
      </button>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-skeleton h-48 animate-pulse rounded-xl" />
      ))}
    </div>
  );
}

export function SettingsView() {
  const tenant = useTenantScope();
  const queryClient = useQueryClient();
  const queriesEnabled = tenant.ready && !!tenant.teamId;

  const {
    data: settings,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.settings(tenant.teamId),
    queryFn: settingsQuery,
    enabled: queriesEnabled,
    staleTime: 30_000,
  });

  const profile = settings?.business_profile;

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [tone, setTone] = useState("");
  const [servicesText, setServicesText] = useState("");
  const [approvalMode, setApprovalMode] = useState<"approval_queue" | "autopilot">(
    "approval_queue",
  );
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setIndustry(profile.industry);
    setTone(profile.tone);
    setServicesText(profile.services.join(", "));
    setApprovalMode(
      profile.approval_mode === "autopilot" ? "autopilot" : "approval_queue",
    );
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: updateSettingsMutation,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.settings(tenant.teamId), next);
      setSaveMessage("Settings saved.");
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "Could not save settings.");
      setSaveMessage(null);
    },
  });

  const usagePercent = useMemo(() => {
    if (!settings?.billing.message_limit) return null;
    return Math.min(
      100,
      Math.round(
        (settings.billing.message_count / settings.billing.message_limit) * 100,
      ),
    );
  }, [settings]);

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings?.editable.workspace_profile) return;
    const services = servicesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    saveMutation.mutate({ name, industry, tone, services, approval_mode: approvalMode });
  }

  if (!tenant.ready || tenant.loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading settings" />
        <p className="text-sm">Loading settings…</p>
      </div>
    );
  }

  if (!tenant.teamId) {
    return (
      <ExecutiveEmptyState
        title="Workspace setup required"
        description="Complete onboarding to bind your team before managing workspace settings."
        icon={<Sparkles className="shrink-0" aria-hidden />}
        className="min-h-[50vh] app-glass-card"
      />
    );
  }

  const errorMsg = error instanceof Error ? error.message : null;

  return (
    <div className="min-h-0 space-y-10">
      <header className="hairline-b pb-8">
        <p className="nexus-meta text-nexus-approval">Workspace</p>
        <h1 className="mt-3 nexus-app-title text-atmospheric-grey">Settings</h1>
        <p className="mb-2 mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Manage your workspace profile, connected channels, AI approval rules, billing,
          and security preferences.
        </p>
      </header>

      {errorMsg ? (
        <div className="border border-status-critical-border bg-status-critical-surface px-4 py-3 font-mono text-sm text-status-critical">
          <span>{errorMsg}</span>{" "}
          <button
            type="button"
            onClick={() => void refetch()}
            className="ml-2 inline-flex min-h-11 cursor-pointer items-center px-2 font-semibold uppercase tracking-wide text-status-positive underline-offset-4 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {isPending && !settings ? (
        <SettingsSkeleton />
      ) : settings ? (
        <div className="space-y-6">
          <SettingsSection
            id="workspace-profile"
            title="Workspace Profile"
            description="Core business details used for routing, classification, and reply drafting."
          >
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldRow label="Business / workspace name">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                    className={INPUT_CLASS}
                    required
                  />
                </FieldRow>
                <FieldRow label="Industry">
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                    className={INPUT_CLASS}
                    required
                  />
                </FieldRow>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldRow
                  label="Timezone"
                  hint="Coming soon — not stored in the database yet."
                >
                  <input
                    type="text"
                    value="Not configured"
                    disabled
                    className={INPUT_CLASS}
                  />
                </FieldRow>
                <FieldRow
                  label="Default currency"
                  hint={
                    settings.fields.currency_from_pricing_rules
                      ? "Read from pricing rules."
                      : "Coming soon — no currency column yet."
                  }
                >
                  <input
                    type="text"
                    value={settings.fields.currency_from_pricing_rules ?? "Not configured"}
                    disabled
                    className={INPUT_CLASS}
                  />
                </FieldRow>
              </div>

              {saveMessage ? (
                <p className="text-sm text-status-positive" role="status">
                  {saveMessage}
                </p>
              ) : null}
              {saveError ? (
                <p className="text-sm text-status-critical" role="alert">
                  {saveError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={
                  !settings.editable.workspace_profile || saveMutation.isPending
                }
                className={PRIMARY_BTN}
              >
                {saveMutation.isPending ? "Saving…" : "Save profile"}
              </button>
            </form>
          </SettingsSection>

          <SettingsSection
            id="channels"
            title="Channels"
            description="Connect inboxes so Nexus OS can ingest, classify, and draft replies."
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-xl border border-glass-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                  <div>
                    <p className="text-sm font-medium text-atmospheric-grey">Gmail</p>
                    <p className="mt-1 text-xs text-muted">
                      {settings.channels.gmail.connected
                        ? settings.channels.gmail.email
                        : "No Gmail account connected for this workspace."}
                    </p>
                    {settings.channels.gmail.last_synced_at ? (
                      <p className="mt-1 text-xs text-muted">
                        Last synced{" "}
                        {formatRelativeTime(settings.channels.gmail.last_synced_at)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    connected={settings.channels.gmail.connected}
                    label={settings.channels.gmail.connected ? "Connected" : "Not connected"}
                  />
                  <a href="/api/gmail/connect" className={SECONDARY_BTN}>
                    {settings.channels.gmail.connected ? "Reconnect" : "Connect Gmail"}
                  </a>
                </div>
              </div>

              {(Object.keys(META_LABELS) as MetaChannelPlatform[]).map((platform) => {
                const channel = settings.channels.meta.platforms[platform];
                const Icon =
                  platform === "whatsapp"
                    ? MessagesSquare
                    : platform === "instagram"
                      ? Camera
                      : MessageCircle;
                return (
                  <div
                    key={platform}
                    className="flex flex-col gap-3 rounded-xl border border-glass-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-atmospheric-grey">
                          {META_LABELS[platform]}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {channel.connected
                            ? channel.wa_display_phone ??
                              channel.ig_username ??
                              channel.page_name ??
                              "Connected"
                            : "Not connected for this workspace."}
                        </p>
                        {channel.last_synced_at ? (
                          <p className="mt-1 text-xs text-muted">
                            Last synced {formatRelativeTime(channel.last_synced_at)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill
                        connected={channel.connected}
                        label={channel.connected ? "Connected" : "Not connected"}
                      />
                      <a
                        href={`/api/meta/connect?platform=${platform}`}
                        className={SECONDARY_BTN}
                      >
                        {channel.connected ? "Reconnect" : "Connect"}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsSection>

          <SettingsSection
            id="ai-rules"
            title="AI & Approval Rules"
            description="Tone and services feed reply drafting. Approval mode controls auto-send vs founder queue."
          >
            <form onSubmit={handleProfileSave} className="space-y-4">
              <FieldRow label="Reply tone">
                <input
                  type="text"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  disabled={!settings.editable.ai_rules || saveMutation.isPending}
                  className={INPUT_CLASS}
                  placeholder="warm, concise, founder-led"
                />
              </FieldRow>

              <FieldRow label="Services offered" hint="Comma-separated list.">
                <textarea
                  value={servicesText}
                  onChange={(e) => setServicesText(e.target.value)}
                  disabled={!settings.editable.ai_rules || saveMutation.isPending}
                  rows={3}
                  className={cn(INPUT_CLASS, "resize-y")}
                  placeholder="Leasing, Sales, Support retainers"
                />
              </FieldRow>

              <FieldRow label="Approval mode">
                <select
                  value={approvalMode}
                  onChange={(e) =>
                    setApprovalMode(
                      e.target.value === "autopilot" ? "autopilot" : "approval_queue",
                    )
                  }
                  disabled={!settings.editable.ai_rules || saveMutation.isPending}
                  className={INPUT_CLASS}
                >
                  <option value="approval_queue">Approval queue — gate all replies</option>
                  <option value="autopilot">
                    Autopilot — auto-send low-risk, low-value replies
                  </option>
                </select>
              </FieldRow>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldRow
                  label="High-value threshold"
                  hint="Hard-coded in approval policy (not editable yet)."
                >
                  <input
                    type="text"
                    value={`$${settings.policy.high_value_threshold.toLocaleString()} estimated value`}
                    disabled
                    className={INPUT_CLASS}
                  />
                </FieldRow>
                <FieldRow
                  label="Churn-risk threshold"
                  hint="Risk score ≥ this value is always hard-gated."
                >
                  <input
                    type="text"
                    value={`${Math.round(settings.policy.high_risk_score * 100)}% risk score`}
                    disabled
                    className={INPUT_CLASS}
                  />
                </FieldRow>
              </div>

              <button
                type="submit"
                disabled={!settings.editable.ai_rules || saveMutation.isPending}
                className={PRIMARY_BTN}
              >
                {saveMutation.isPending ? "Saving…" : "Save AI rules"}
              </button>
            </form>
          </SettingsSection>

          <SettingsSection
            id="billing"
            title="Billing & Usage"
            description="Plan and message volume for the current billing period."
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-atmospheric-grey">
                    Current plan
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-nexus-growth">
                    {planTitle(settings.billing.plan_tier)}
                  </p>
                  <p className="mt-1 text-xs capitalize text-muted">
                    Status: {settings.billing.status ?? "pending"}
                    {settings.billing.billing_cycle
                      ? ` · ${settings.billing.billing_cycle}`
                      : ""}
                  </p>
                  {settings.billing.trial_ends_at ? (
                    <p className="mt-1 text-xs text-muted">
                      Trial ends {formatRelativeTime(settings.billing.trial_ends_at)}
                    </p>
                  ) : null}
                </div>
                <Link href="/pricing" className={SECONDARY_BTN}>
                  View plans
                </Link>
              </div>

              <div className="rounded-xl border border-glass-border px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-atmospheric-grey">
                    Messages this period
                  </p>
                  <p className="text-sm tabular-nums text-atmospheric-grey">
                    {settings.billing.message_count.toLocaleString()}
                    {settings.billing.message_limit
                      ? ` / ${settings.billing.message_limit.toLocaleString()}`
                      : " · unlimited"}
                  </p>
                </div>
                {usagePercent !== null ? (
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        usagePercent >= 80
                          ? "bg-nexus-rescue"
                          : "bg-nexus-growth",
                      )}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>
                ) : null}
                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {planPricingCopy(planTierToSlug(
                    settings.billing.plan_tier === "pro" ||
                      settings.billing.plan_tier === "team"
                      ? "pro"
                      : settings.billing.plan_tier === "enterprise"
                        ? "enterprise"
                        : "starter",
                  ))}
                </p>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="security"
            title="Security"
            description="Credential storage and account controls."
          >
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-glass-border px-4 py-4">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-nexus-intake" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-atmospheric-grey">
                    Encrypted credentials
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Gmail and Meta OAuth tokens are encrypted at rest with AES-256 before
                    storage. Nexus OS never exposes raw tokens in the dashboard.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-glass-border px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Gmail credentials
                  </p>
                  <p className="mt-2 text-sm text-atmospheric-grey">
                    {settings.security.gmail_credential_present
                      ? "Connected credential on file"
                      : "None connected"}
                  </p>
                </div>
                <div className="rounded-xl border border-glass-border px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Meta credentials
                  </p>
                  <p className="mt-2 text-sm text-atmospheric-grey">
                    {settings.security.meta_credentials_count > 0
                      ? `${settings.security.meta_credentials_count} connected`
                      : "None connected"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-glass-border px-4 py-4">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-atmospheric-grey">
                    Signed in as
                  </p>
                  <p className="mt-1 truncate text-sm text-muted">
                    {settings.security.user_email ?? "Unknown account"}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Use the sidebar Log out control to end your session.
                  </p>
                </div>
              </div>
            </div>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="Notifications"
            description="Alert preferences — persistence is not implemented yet."
          >
            <div className="space-y-3">
              <PlaceholderToggle
                label="Daily Buy-Back Report email"
                description="Receive the daily revenue rescue summary by email. Coming soon."
              />
              <PlaceholderToggle
                label="High-value lead alerts"
                description="Get notified when a classified lead exceeds your value threshold. Coming soon."
              />
              <div className="flex items-start gap-2 rounded-xl border border-dashed border-glass-border px-4 py-3 text-xs text-muted">
                <Bell className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Notification toggles are UI placeholders only. No database columns or
                  send hooks exist yet.
                </span>
              </div>
            </div>
          </SettingsSection>
        </div>
      ) : errorMsg ? (
        <EmptyState
          title="Settings unavailable"
          description={errorMsg}
          icon={<AlertTriangle />}
          className="app-glass-card min-h-[40vh]"
        />
      ) : null}
    </div>
  );
}
