"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Lock,
  Mail,
  Shield,
  Sparkles,
  Users,
  Pause,
  Play,
  Unplug,
  Wand2,
  FileText,
  Trash2,
  UploadCloud,
  RotateCcw,
} from "lucide-react";
import {
  FaFacebookF,
  FaFacebookMessenger,
  FaInstagram,
  FaLinkedinIn,
  FaWhatsapp,
  FaXTwitter,
} from "react-icons/fa6";
import { authenticatedFetch } from "@/lib/auth/authenticated-fetch";
import { POST_PLATFORMS, PLATFORM_LABELS } from "@/lib/posts/types";
import type { Platform } from "@/lib/posts/types";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { MailboxConnectForm } from "@/components/settings/MailboxConnectForm";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExecutiveEmptyState } from "@/components/ui/ExecutiveEmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { useTenantScope } from "@/components/tenant/TenantScope";
import {
  isBillingEnabled,
  isMetaInboxEnabled,
} from "@/lib/feature-flags";
import {
  planTierToSlug,
  PRICING_TIERS,
  type PricingPlanSlug,
} from "@/lib/pricing/plans";
import {
  businessDocsQuery,
  deleteBusinessDoc,
  enhancePersona,
  settingsQuery,
  updateSettingsMutation,
  uploadBusinessDoc,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import { DEFAULT_ANALYST_PERSONA } from "@/lib/chat/persona";
import { workspaceIndustryOptions } from "@/lib/workspace-industries";
import type { MetaChannelPlatform, NotificationPrefs } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const INPUT_CLASS =
  "w-full rounded-xl border border-glass-border bg-glass px-3 py-2.5 text-sm text-atmospheric-grey outline-none transition focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-60";

const PRIMARY_BTN =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-nexus-approval-border bg-nexus-approval-soft px-4 py-2 text-[13px] font-medium text-nexus-approval transition-colors hover:bg-nexus-approval-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50";

const SECONDARY_BTN =
  "inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-border-strong bg-surface-muted px-3 py-2 text-sm font-medium text-atmospheric-grey transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50";

const SOCIAL_ICONS: Record<Platform, typeof FaInstagram> = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  x: FaXTwitter,
  linkedin: FaLinkedinIn,
};

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

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexus-approval disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-nexus-approval" : "bg-surface-muted",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "left-6" : "left-1",
        )}
      />
    </button>
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

/**
 * Task E.2: `/profile` is the landing spot for OAuth callbacks (Gmail via `/signup?step=gmail`
 * historically, Meta via `metaDashboardUrl` — Task D.3). Turn their status query params into a
 * one-line banner instead of silently dropping them, and scroll to the relevant section
 * (`?section=channels`) so the user lands exactly where the thing they just did lives.
 */
function useCallbackStatusBanner(): { message: string; tone: "positive" | "critical" } | null {
  const searchParams = useSearchParams();
  const [banner, setBanner] = useState<{ message: string; tone: "positive" | "critical" } | null>(
    null,
  );

  useEffect(() => {
    const section = searchParams.get("section");
    if (section) {
      // Defer to the next frame so the section has mounted before we scroll to it.
      requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    const metaConnected = searchParams.get("meta_connected");
    const metaError = searchParams.get("meta_error");
    const gmailConnected = searchParams.get("gmail_connected");
    const gmailError = searchParams.get("gmail_error");

    if (metaConnected) {
      setBanner({ message: `Connected: ${metaConnected.split(",").join(", ")}.`, tone: "positive" });
    } else if (metaError) {
      setBanner({ message: `Meta connection failed (${metaError}). Please try again.`, tone: "critical" });
    } else if (gmailConnected) {
      setBanner({ message: "Gmail connected.", tone: "positive" });
    } else if (gmailError) {
      setBanner({ message: `Gmail connection failed (${gmailError}). Please try again.`, tone: "critical" });
    }
  }, [searchParams]);

  return banner;
}

export function SettingsView() {
  const tenant = useTenantScope();
  const queryClient = useQueryClient();
  const queriesEnabled = tenant.ready && !!tenant.teamId;
  const [socialBusy, setSocialBusy] = useState<Platform | null>(null);
  const callbackBanner = useCallbackStatusBanner();

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
  const [fullName, setFullName] = useState("");
  const [industry, setIndustry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [currency, setCurrency] = useState("");
  const [pricingNotes, setPricingNotes] = useState("");
  const [tone, setTone] = useState("");
  const [chatPersona, setChatPersona] = useState(DEFAULT_ANALYST_PERSONA);
  const [enhancing, setEnhancing] = useState(false);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [servicesText, setServicesText] = useState("");
  const [approvalMode, setApprovalMode] = useState<"approval_queue" | "autopilot">(
    "approval_queue",
  );
  const [highValueThreshold, setHighValueThreshold] = useState(500);
  const [highRiskScore, setHighRiskScore] = useState(0.8);
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>({
    buy_back_report_email: false,
    high_value_lead_alerts: false,
  });
  const [chatVisualsEnabled, setChatVisualsEnabled] = useState(true);
  const [aiBudgetText, setAiBudgetText] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [channelBusy, setChannelBusy] = useState<string | null>(null);

  const industryOptions = useMemo(
    () => workspaceIndustryOptions(industry),
    [industry],
  );

  useEffect(() => {
    if (!settings) return;
    setFullName(settings.account.full_name ?? "");
  }, [settings]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setIndustry(profile.industry);
    setTimezone(profile.timezone ?? "");
    setCurrency(
      typeof profile.pricing_rules.currency === "string"
        ? profile.pricing_rules.currency
        : settings?.fields.currency_from_pricing_rules ?? "",
    );
    setPricingNotes(
      typeof profile.pricing_rules.notes === "string" ? profile.pricing_rules.notes : "",
    );
    setTone(profile.tone);
    setChatPersona(profile.chat_persona ?? DEFAULT_ANALYST_PERSONA);
    setServicesText(profile.services.join(", "));
    setApprovalMode(
      profile.approval_mode === "autopilot" ? "autopilot" : "approval_queue",
    );
    setNotificationPrefs(profile.notification_prefs);
    setChatVisualsEnabled(profile.chat_visuals_enabled);
    setAiBudgetText(
      profile.ai_monthly_token_budget != null ? String(profile.ai_monthly_token_budget) : "",
    );
  }, [profile, settings?.fields.currency_from_pricing_rules]);

  useEffect(() => {
    if (!settings) return;
    setHighValueThreshold(settings.policy.high_value_threshold);
    setHighRiskScore(settings.policy.high_risk_score);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: updateSettingsMutation,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.settings(tenant.teamId), next);
      setSaveMessage("Profile saved.");
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "Could not save settings.");
      setSaveMessage(null);
    },
  });

  const aiRulesEditable = !!settings?.editable.ai_rules;

  const { data: businessDocs } = useQuery({
    queryKey: queryKeys.businessDocs(tenant.teamId),
    queryFn: businessDocsQuery,
    enabled: queriesEnabled && aiRulesEditable,
    staleTime: 15_000,
    // Poll while any document is still being processed, then stop.
    refetchInterval: (query) => {
      const docs = query.state.data;
      return Array.isArray(docs) && docs.some((d) => d.status === "processing")
        ? 3000
        : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: uploadBusinessDoc,
    onSuccess: () => {
      setSelectedFile(null);
      setUploadError(null);
      queryClient.invalidateQueries({
        queryKey: queryKeys.businessDocs(tenant.teamId),
      });
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: deleteBusinessDoc,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.businessDocs(tenant.teamId),
      });
    },
    onError: (err) => {
      setUploadError(err instanceof Error ? err.message : "Delete failed.");
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

  function handleAccountSave(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate({ full_name: fullName.trim() });
  }

  function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings?.editable.workspace_profile) return;
    saveMutation.mutate({
      name,
      industry,
      timezone: timezone.trim() || undefined,
      currency: currency.trim().toUpperCase() || undefined,
      pricing_notes: pricingNotes,
    });
  }

  function handleAiRulesSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings?.editable.ai_rules) return;
    const services = servicesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const budgetTrimmed = aiBudgetText.trim();
    const budgetNumber = budgetTrimmed ? Number(budgetTrimmed) : null;
    saveMutation.mutate({
      tone,
      chat_persona: chatPersona,
      services,
      approval_mode: approvalMode,
      high_value_threshold: highValueThreshold,
      high_risk_score: highRiskScore,
      chat_visuals_enabled: chatVisualsEnabled,
      ai_monthly_token_budget:
        budgetNumber !== null && Number.isFinite(budgetNumber) && budgetNumber >= 0
          ? Math.floor(budgetNumber)
          : null,
    });
  }

  async function handleEnhancePersona() {
    if (!chatPersona.trim() || enhancing) return;
    setEnhancing(true);
    setPersonaError(null);
    try {
      const enhanced = await enhancePersona(chatPersona);
      setChatPersona(enhanced);
    } catch (err) {
      setPersonaError(err instanceof Error ? err.message : "Could not enhance the prompt.");
    } finally {
      setEnhancing(false);
    }
  }

  function handleNotificationSave(next: NotificationPrefs) {
    if (!settings?.editable.workspace_profile) return;
    setNotificationPrefs(next);
    saveMutation.mutate({ notification_prefs: next });
  }

  async function handleSocialDisconnect(platform: Platform) {
    if (!window.confirm(`Disconnect ${PLATFORM_LABELS[platform]} publishing?`)) return;
    setSocialBusy(platform);
    try {
      const res = await authenticatedFetch("/api/social/disconnect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      if (!res.ok) throw new Error("Disconnect failed");
      await refetch();
    } catch {
      /* surfaced by the row state on next refetch */
    } finally {
      setSocialBusy(null);
    }
  }

  async function handleChannelAction(
    target: "gmail" | MetaChannelPlatform,
    action: "set_sync" | "disconnect",
    syncEnabled?: boolean,
  ) {
    if (!settings?.editable.channels) return;
    const key = `${target}:${action}`;
    setChannelBusy(key);
    setSaveError(null);
    try {
      const next = await updateSettingsMutation({
        channel: {
          target,
          action,
          ...(action === "set_sync" ? { sync_enabled: syncEnabled } : {}),
        },
      });
      queryClient.setQueryData(queryKeys.settings(tenant.teamId), next);
      setSaveMessage(
        action === "disconnect"
          ? "Channel disconnected."
          : syncEnabled
            ? "Sync resumed."
            : "Sync paused.",
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Channel update failed.");
      setSaveMessage(null);
    } finally {
      setChannelBusy(null);
    }
  }

  if (!tenant.ready || tenant.loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading profile" />
        <p className="text-sm">Loading profile…</p>
      </div>
    );
  }

  if (!tenant.teamId) {
    return (
      <ExecutiveEmptyState
        title="Workspace setup required"
        description="Complete onboarding to bind your team before managing your profile."
        icon={<Sparkles className="shrink-0" aria-hidden />}
        className="min-h-[50vh] app-glass-card"
      />
    );
  }

  const errorMsg = error instanceof Error ? error.message : null;

  return (
    <div className="min-h-0 space-y-10">
      <header className="hairline-b pb-8">
        <p className="nexus-meta text-nexus-approval">Account</p>
        <h1 className="mt-3 nexus-app-title text-atmospheric-grey">Settings</h1>
        <p className="mb-2 mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Manage your account, workspace profile, connected channels, AI approval rules,
          billing, and security preferences.
        </p>
      </header>

      {callbackBanner ? (
        <div
          role="status"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            callbackBanner.tone === "positive"
              ? "border-nexus-growth-border bg-nexus-growth-soft text-status-positive"
              : "border-status-critical-border bg-status-critical-surface text-status-critical",
          )}
        >
          {callbackBanner.message}
        </div>
      ) : null}

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
            id="account"
            title="Profile Settings"
            description="Your personal identity in Nexus OS."
          >
            <form onSubmit={handleAccountSave} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldRow label="Display name">
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={saveMutation.isPending}
                    className={INPUT_CLASS}
                    placeholder="Your name"
                    autoComplete="name"
                  />
                </FieldRow>
                <FieldRow label="Email">
                  <input
                    type="email"
                    value={settings.account.email ?? ""}
                    readOnly
                    disabled
                    className={cn(INPUT_CLASS, "opacity-70")}
                  />
                </FieldRow>
              </div>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className={PRIMARY_BTN}
              >
                {saveMutation.isPending ? "Saving…" : "Save account"}
              </button>
            </form>
          </SettingsSection>

          <SettingsSection
            id="team"
            title="Team"
            description="Invite teammates and manage workspace access."
          >
            <div className="flex flex-col gap-3 rounded-xl border border-glass-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-atmospheric-grey">Team members</p>
                  <p className="mt-1 text-xs text-muted">
                    Send invites and manage roles from the Team page.
                  </p>
                </div>
              </div>
              <Link href="/team" className={SECONDARY_BTN}>
                Open Team
              </Link>
            </div>
          </SettingsSection>

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
                  <select
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                    className={INPUT_CLASS}
                    required
                  >
                    {industryOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </FieldRow>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldRow label="Timezone" hint="IANA timezone for reports and scheduling.">
                  <input
                    type="text"
                    list="settings-timezones"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                    className={INPUT_CLASS}
                    placeholder="America/New_York"
                  />
                  <datalist id="settings-timezones">
                    {(settings.fields.common_timezones ?? []).map((tz) => (
                      <option key={tz} value={tz} />
                    ))}
                  </datalist>
                </FieldRow>
                <FieldRow label="Default currency" hint="ISO 4217 code stored in pricing rules.">
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                    className={INPUT_CLASS}
                    placeholder="USD"
                    maxLength={3}
                  />
                </FieldRow>
              </div>

              <FieldRow
                label="Pricing rules"
                hint="Services, packages, and rate notes used when drafting replies."
              >
                <textarea
                  value={pricingNotes}
                  onChange={(e) => setPricingNotes(e.target.value)}
                  disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                  rows={5}
                  className={cn(INPUT_CLASS, "resize-y")}
                  placeholder="Example: Strategy calls $500. Monthly retainer from $2k. Rush support +20%."
                />
              </FieldRow>

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
            id="appearance"
            title="Appearance"
            description="Theme and dashboard text size. Saved on this device."
          >
            <AppearanceSettings />
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
                  {settings.channels.gmail.connected ? (
                    <>
                      <button
                        type="button"
                        disabled={!settings.editable.channels || !!channelBusy}
                        onClick={() =>
                          void handleChannelAction(
                            "gmail",
                            "set_sync",
                            !settings.channels.gmail.sync_enabled,
                          )
                        }
                        className={SECONDARY_BTN}
                      >
                        {settings.channels.gmail.sync_enabled ? (
                          <>
                            <Pause className="h-4 w-4" aria-hidden />
                            Pause sync
                          </>
                        ) : (
                          <>
                            <Play className="h-4 w-4" aria-hidden />
                            Resume sync
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        disabled={!settings.editable.channels || !!channelBusy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Disconnect Gmail? Nexus OS will stop ingesting new mail until you reconnect.",
                            )
                          ) {
                            void handleChannelAction("gmail", "disconnect");
                          }
                        }}
                        className={SECONDARY_BTN}
                      >
                        <Unplug className="h-4 w-4" aria-hidden />
                        Disconnect
                      </button>
                    </>
                  ) : null}
                  <a href="/api/gmail/connect" className={SECONDARY_BTN}>
                    {settings.channels.gmail.connected ? "Reconnect" : "Connect Gmail"}
                  </a>
                </div>
              </div>

              <MailboxConnectForm
                workspaceId={settings.workspace.id}
                editable={settings.editable.channels}
                onConnected={() => void refetch()}
              />

              {/* Task C: hidden behind NEXT_PUBLIC_FEATURE_META_INBOX (default OFF) — the Meta
                  connect/OAuth routes stay alive, this only hides the connect affordance so we
                  don't invite tenants into an unfinished unified inbox. */}
              {isMetaInboxEnabled() &&
                (Object.keys(META_LABELS) as MetaChannelPlatform[]).map((platform) => {
                const channel = settings.channels.meta.platforms[platform];
                const Icon =
                  platform === "whatsapp"
                    ? FaWhatsapp
                    : platform === "instagram"
                      ? FaInstagram
                      : FaFacebookMessenger;
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
                      {channel.connected ? (
                        <>
                          <button
                            type="button"
                            disabled={!settings.editable.channels || !!channelBusy}
                            onClick={() =>
                              void handleChannelAction(
                                platform,
                                "set_sync",
                                !channel.sync_enabled,
                              )
                            }
                            className={SECONDARY_BTN}
                          >
                            {channel.sync_enabled ? (
                              <>
                                <Pause className="h-4 w-4" aria-hidden />
                                Pause sync
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4" aria-hidden />
                                Resume sync
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={!settings.editable.channels || !!channelBusy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Disconnect ${META_LABELS[platform]}? Ingest will stop until you reconnect.`,
                                )
                              ) {
                                void handleChannelAction(platform, "disconnect");
                              }
                            }}
                            className={SECONDARY_BTN}
                          >
                            <Unplug className="h-4 w-4" aria-hidden />
                            Disconnect
                          </button>
                        </>
                      ) : null}
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
            <form onSubmit={handleAiRulesSave} className="space-y-4">
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

              {/* Chat personalization — editable system message for the Revenue Analyst. */}
              <div className="space-y-2">
                <span className="block text-sm font-medium text-atmospheric-grey">
                  Chat personalization
                </span>
                <span className="block text-xs text-muted">
                  This is sent to your AI assistant as its system message. Shape it into a
                  specialized business analyst. Your read-only safety rules (never send, never
                  fabricate numbers) are always kept on top of whatever you write here.
                </span>
                <textarea
                  value={chatPersona}
                  onChange={(e) => setChatPersona(e.target.value)}
                  disabled={!settings.editable.ai_rules || saveMutation.isPending}
                  rows={12}
                  className={cn(INPUT_CLASS, "resize-y font-mono text-[13px] leading-relaxed")}
                  placeholder="Describe how the AI should analyze your business and advise you…"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleEnhancePersona}
                    disabled={
                      !settings.editable.ai_rules ||
                      saveMutation.isPending ||
                      enhancing ||
                      !chatPersona.trim()
                    }
                    className={SECONDARY_BTN}
                    title="Rewrite your draft into a structured prompt-engineered system message"
                  >
                    {enhancing ? (
                      <Spinner className="h-4 w-4" label="Enhancing" />
                    ) : (
                      <Wand2 className="h-4 w-4" aria-hidden />
                    )}
                    <span className="ml-2">{enhancing ? "Enhancing…" : "Enhance with AI"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatPersona(DEFAULT_ANALYST_PERSONA)}
                    disabled={!settings.editable.ai_rules || saveMutation.isPending}
                    className={SECONDARY_BTN}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    <span className="ml-2">Reset to default</span>
                  </button>
                </div>
                {personaError ? (
                  <p className="text-xs text-status-critical" role="alert">
                    {personaError}
                  </p>
                ) : null}
              </div>

              {/* Chat visuals — lets the analyst render charts inside answers. */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-glass-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-atmospheric-grey">Visual answers</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Let Chat build charts and tables inside chat answers when
                    they explain the data better than text. Note: visual answers use more AI
                    usage per reply.
                  </p>
                </div>
                <Toggle
                  label="Visual answers in chat"
                  checked={chatVisualsEnabled}
                  disabled={!settings.editable.ai_rules || saveMutation.isPending}
                  onChange={(next) => setChatVisualsEnabled(next)}
                />
              </div>

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

              {/* Business knowledge — uploaded docs are embedded into the vector store (RAG). */}
              <div className="space-y-3 rounded-xl border border-glass-border px-4 py-4">
                <div>
                  <span className="block text-sm font-medium text-atmospheric-grey">
                    Business knowledge
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    Upload documents about your business (pricing, policies, FAQs, product
                    details). Their contents are indexed into your private knowledge base and used
                    to ground your AI assistant&apos;s answers. PDF, TXT, or Markdown · up to 5&nbsp;MB.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
                    disabled={!settings.editable.ai_rules || uploadMutation.isPending}
                    onChange={(e) => {
                      setUploadError(null);
                      setSelectedFile(e.target.files?.[0] ?? null);
                    }}
                    className="block max-w-full text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border-strong file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-atmospheric-grey hover:file:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => selectedFile && uploadMutation.mutate(selectedFile)}
                    disabled={
                      !settings.editable.ai_rules ||
                      !selectedFile ||
                      uploadMutation.isPending
                    }
                    className={SECONDARY_BTN}
                  >
                    {uploadMutation.isPending ? (
                      <Spinner className="h-4 w-4" label="Uploading" />
                    ) : (
                      <UploadCloud className="h-4 w-4" aria-hidden />
                    )}
                    <span className="ml-2">
                      {uploadMutation.isPending ? "Processing…" : "Upload"}
                    </span>
                  </button>
                </div>

                {uploadError ? (
                  <p className="text-xs text-status-critical" role="alert">
                    {uploadError}
                  </p>
                ) : null}

                {businessDocs && businessDocs.length > 0 ? (
                  <ul className="space-y-1.5">
                    {businessDocs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center gap-2 rounded-lg border border-glass-border bg-glass px-3 py-2 text-sm"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-atmospheric-grey">
                          {doc.file_name}
                        </span>
                        <span
                          className={cn(
                            "inline-flex min-h-[1.5rem] items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                            doc.status === "ready"
                              ? "border-nexus-growth-border bg-nexus-growth-soft text-status-positive"
                              : doc.status === "failed"
                                ? "border-status-critical-border bg-status-critical-surface text-status-critical"
                                : "border-border-strong bg-surface-muted text-muted",
                          )}
                          title={doc.error ?? undefined}
                        >
                          {doc.status === "ready"
                            ? `Indexed · ${doc.chunk_count} chunks`
                            : doc.status === "failed"
                              ? "Failed"
                              : "Processing…"}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteDocMutation.mutate(doc.id)}
                          disabled={deleteDocMutation.isPending}
                          className="inline-flex min-h-8 shrink-0 cursor-pointer items-center justify-center rounded-lg px-2 text-muted transition hover:text-status-critical disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={`Delete ${doc.file_name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="text-[11px] leading-relaxed text-muted">
                  <Lock className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
                  Privacy: your documents are stored privately, encrypted at rest, and scoped to
                  this workspace only. They are used solely to inform your AI assistant&apos;s
                  answers. Never shared with other tenants and never used to train AI models.
                </p>
              </div>

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
                  <option value="approval_queue">Approval queue: gate all replies</option>
                  <option value="autopilot">
                    Autopilot: auto-send low-risk, low-value replies
                  </option>
                </select>
              </FieldRow>

              <div className="grid gap-4 sm:grid-cols-2">
                <FieldRow
                  label="High-value threshold"
                  hint="Estimated value at or above this amount is always hard-gated."
                >
                  <input
                    type="number"
                    min={0}
                    step={50}
                    value={highValueThreshold}
                    onChange={(e) => setHighValueThreshold(Number(e.target.value))}
                    disabled={!settings.editable.ai_rules || saveMutation.isPending}
                    className={INPUT_CLASS}
                  />
                </FieldRow>
                <FieldRow
                  label="Churn-risk threshold"
                  hint="Risk score ≥ this value (0–1) is always hard-gated."
                >
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={highRiskScore}
                    onChange={(e) => setHighRiskScore(Number(e.target.value))}
                    disabled={!settings.editable.ai_rules || saveMutation.isPending}
                    className={INPUT_CLASS}
                  />
                </FieldRow>
                <FieldRow
                  label="Monthly AI budget (tokens)"
                  hint="Soft alert threshold against tracked AI usage. Never blocks sends. Leave empty for no budget."
                >
                  <input
                    type="number"
                    min={0}
                    step={100000}
                    value={aiBudgetText}
                    onChange={(e) => setAiBudgetText(e.target.value)}
                    disabled={!settings.editable.ai_rules || saveMutation.isPending}
                    className={INPUT_CLASS}
                    placeholder="e.g. 2000000"
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
                {/* Task E.6: no checkout/payment-method flow ships yet — hide the plan-change CTA
                    behind NEXT_PUBLIC_FEATURE_BILLING until that's wired up. */}
                {isBillingEnabled() ? (
                  <Link href="/pricing" className={SECONDARY_BTN}>
                    View plans
                  </Link>
                ) : null}
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
            id="social-posting"
            title="Social Posting"
            description="Connect the accounts Nexus OS publishes posts to."
          >
            <div className="space-y-3">
              {POST_PLATFORMS.map((platform) => {
                const connected = settings.social.platforms.includes(platform);
                const Icon = SOCIAL_ICONS[platform];
                return (
                  <div
                    key={platform}
                    className="flex flex-col gap-3 rounded-xl border border-glass-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                      <div>
                        <p className="text-sm font-medium text-atmospheric-grey">
                          {PLATFORM_LABELS[platform]}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {connected
                            ? "Connected for publishing."
                            : "Not connected — you can't publish here yet."}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill
                        connected={connected}
                        label={connected ? "Connected" : "Not connected"}
                      />
                      {connected ? (
                        <button
                          type="button"
                          disabled={socialBusy === platform}
                          onClick={() => void handleSocialDisconnect(platform)}
                          className={SECONDARY_BTN}
                        >
                          {socialBusy === platform ? (
                            <Spinner className="h-4 w-4" label="Working" />
                          ) : (
                            <Unplug className="h-4 w-4" aria-hidden />
                          )}
                          Disconnect
                        </button>
                      ) : null}
                      <a href={`/api/social/connect?platform=${platform}`} className={SECONDARY_BTN}>
                        {connected ? "Reconnect" : "Connect"}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsSection>

          <SettingsSection
            id="notifications"
            title="Notifications"
            description="Alert preferences are saved to your workspace. Delivery hooks are wired when email alerts ship."
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4 rounded-xl border border-glass-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-atmospheric-grey">
                    Daily Buy-Back Report email
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Receive the daily revenue rescue summary by email when delivery is enabled.
                  </p>
                </div>
                <Toggle
                  label="Daily Buy-Back Report email"
                  checked={notificationPrefs.buy_back_report_email}
                  disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                  onChange={(next) =>
                    handleNotificationSave({
                      ...notificationPrefs,
                      buy_back_report_email: next,
                    })
                  }
                />
              </div>
              <div className="flex items-start justify-between gap-4 rounded-xl border border-glass-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-atmospheric-grey">
                    High-value lead alerts
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Get notified when a classified lead exceeds your value threshold.
                  </p>
                </div>
                <Toggle
                  label="High-value lead alerts"
                  checked={notificationPrefs.high_value_lead_alerts}
                  disabled={!settings.editable.workspace_profile || saveMutation.isPending}
                  onChange={(next) =>
                    handleNotificationSave({
                      ...notificationPrefs,
                      high_value_lead_alerts: next,
                    })
                  }
                />
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-glass-border px-4 py-3 text-xs text-muted">
                <Bell className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Preferences are stored on your business profile. Email delivery will honor these
                  settings when the notification pipeline is enabled.
                </span>
              </div>
            </div>
          </SettingsSection>
        </div>
      ) : errorMsg ? (
        <EmptyState
          title="Profile unavailable"
          description={errorMsg}
          icon={<AlertTriangle />}
          className="app-glass-card min-h-[40vh]"
        />
      ) : null}
    </div>
  );
}
