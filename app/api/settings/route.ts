import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  JSON_LIMITS,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import {
  HIGH_RISK_SCORE,
  HIGH_VALUE_THRESHOLD,
} from "@/lib/approval-policy";
import { META_PLATFORMS } from "@/app/api/meta/helpers";
import type {
  MetaChannelPlatform,
  NotificationPrefs,
  WorkspaceSettings,
} from "@/types";

export const dynamic = "force-dynamic";

const APPROVAL_MODES = new Set(["approval_queue", "autopilot"]);
const CHANNEL_TARGETS = new Set(["gmail", ...META_PLATFORMS]);
const CHANNEL_ACTIONS = new Set(["set_sync", "disconnect"]);
const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
] as const;

type SettingsPatchBody = {
  name?: unknown;
  industry?: unknown;
  tone?: unknown;
  chat_persona?: unknown;
  services?: unknown;
  approval_mode?: unknown;
  timezone?: unknown;
  currency?: unknown;
  high_value_threshold?: unknown;
  high_risk_score?: unknown;
  notification_prefs?: unknown;
  channel?: unknown;
  chat_visuals_enabled?: unknown;
  ai_monthly_token_budget?: unknown;
};

type ChannelPatch = {
  target: string;
  action: string;
  sync_enabled?: boolean;
};

function messageLimitForPlan(planTier: string | null | undefined): number | null {
  switch (planTier) {
    case "starter":
      return 500;
    case "pro":
    case "team":
      return 5000;
    case "enterprise":
      return null;
    default:
      return 500;
  }
}

function billingPeriodBounds(
  periodStart: string | null | undefined,
  periodEnd: string | null | undefined,
): { start: string; end: string } {
  const now = new Date();
  if (periodStart && periodEnd) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start: start.toISOString(), end: end.toISOString() };
    }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function parseServices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readCurrency(pricingRules: unknown): string | null {
  if (!pricingRules || typeof pricingRules !== "object" || Array.isArray(pricingRules)) {
    return null;
  }
  const currency = (pricingRules as Record<string, unknown>).currency;
  return typeof currency === "string" && currency.trim() ? currency.trim() : null;
}

function parseNotificationPrefs(value: unknown): NotificationPrefs {
  const defaults: NotificationPrefs = {
    buy_back_report_email: false,
    high_value_lead_alerts: false,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  return {
    buy_back_report_email:
      typeof raw.buy_back_report_email === "boolean"
        ? raw.buy_back_report_email
        : defaults.buy_back_report_email,
    high_value_lead_alerts:
      typeof raw.high_value_lead_alerts === "boolean"
        ? raw.high_value_lead_alerts
        : defaults.high_value_lead_alerts,
  };
}

function mergeNotificationPrefs(
  existing: unknown,
  patch: unknown,
): NotificationPrefs | null {
  if (patch === undefined) return null;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const current = parseNotificationPrefs(existing);
  const incoming = patch as Record<string, unknown>;
  return {
    buy_back_report_email:
      typeof incoming.buy_back_report_email === "boolean"
        ? incoming.buy_back_report_email
        : current.buy_back_report_email,
    high_value_lead_alerts:
      typeof incoming.high_value_lead_alerts === "boolean"
        ? incoming.high_value_lead_alerts
        : current.high_value_lead_alerts,
  };
}

function parseChannelPatch(value: unknown): ChannelPatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.target !== "string" || typeof raw.action !== "string") return null;
  return {
    target: raw.target,
    action: raw.action,
    sync_enabled:
      typeof raw.sync_enabled === "boolean" ? raw.sync_enabled : undefined,
  };
}

function numOrDefault(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return value;
}

function isValidTimezone(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: trimmed });
    return true;
  } catch {
    return false;
  }
}

function isValidCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim());
}

async function applyChannelPatch(
  supabase: SupabaseClient,
  workspaceId: string | null,
  patch: ChannelPatch,
): Promise<string | null> {
  if (!workspaceId) return "Workspace not found";
  if (!CHANNEL_TARGETS.has(patch.target)) return "Invalid channel target";
  if (!CHANNEL_ACTIONS.has(patch.action)) return "Invalid channel action";

  if (patch.target === "gmail") {
    if (patch.action === "set_sync") {
      if (typeof patch.sync_enabled !== "boolean") return "sync_enabled is required";
      const { error } = await supabase
        .from("gmail_credentials")
        .update({
          sync_enabled: patch.sync_enabled,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("status", "connected");
      return error?.message ?? null;
    }

    if (patch.action === "disconnect") {
      const { error } = await supabase
        .from("gmail_credentials")
        .update({
          status: "disconnected",
          sync_enabled: false,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("status", "connected");
      return error?.message ?? null;
    }
  }

  if (!(META_PLATFORMS as readonly string[]).includes(patch.target)) {
    return "Invalid Meta platform";
  }

  if (patch.action === "set_sync") {
    if (typeof patch.sync_enabled !== "boolean") return "sync_enabled is required";
    const { error } = await supabase
      .from("meta_credentials")
      .update({
        sync_enabled: patch.sync_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("platform", patch.target)
      .eq("status", "connected");
    return error?.message ?? null;
  }

  if (patch.action === "disconnect") {
    const { error } = await supabase
      .from("meta_credentials")
      .update({
        status: "disconnected",
        sync_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("platform", patch.target)
      .eq("status", "connected");
    return error?.message ?? null;
  }

  return "Unsupported channel action";
}

export async function GET() {
  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const { supabase, teamId, workspaceId, user } = tenant;

  const [
    workspaceResult,
    profileResult,
    subscriptionResult,
    gmailResult,
    metaResult,
    userProfileResult,
  ] = await Promise.all([
    workspaceId
      ? supabase
          .from("workspaces")
          .select("id, name, industry")
          .eq("id", workspaceId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("business_profiles")
      .select(
        "id, name, industry, tone, chat_persona, services, pricing_rules, approval_mode, workspace_id, timezone, high_value_threshold, high_risk_score, notification_prefs, chat_visuals_enabled, ai_monthly_token_budget",
      )
      .eq("team_id", teamId)
      .maybeSingle(),
    workspaceId
      ? supabase
          .from("subscriptions")
          .select(
            "plan_tier, billing_cycle, status, trial_ends_at, current_period_start, current_period_end",
          )
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workspaceId
      ? supabase
          .from("gmail_credentials")
          .select(
            "id, email_address, status, sync_enabled, last_synced_at, credential_type",
          )
          .eq("workspace_id", workspaceId)
          .eq("status", "connected")
          .order("last_synced_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    workspaceId
      ? supabase
          .from("meta_credentials")
          .select(
            "id, platform, page_name, ig_username, wa_display_phone, sync_enabled, last_synced_at, status",
          )
          .eq("workspace_id", workspaceId)
          .eq("status", "connected")
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const queryError =
    workspaceResult.error ??
    profileResult.error ??
    subscriptionResult.error ??
    gmailResult.error ??
    metaResult.error ??
    userProfileResult.error;

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const organizationId =
    userProfileResult.data &&
    typeof (userProfileResult.data as { organization_id?: unknown }).organization_id ===
      "string"
      ? ((userProfileResult.data as { organization_id: string }).organization_id.trim() ||
          null)
      : null;

  let socialPlatforms: string[] = [];
  if (organizationId) {
    const { data: socialRows, error: socialErr } = await supabase
      .from("social_credentials")
      .select("platform")
      .eq("organization_id", organizationId);
    if (socialErr) {
      return NextResponse.json({ error: socialErr.message }, { status: 500 });
    }
    socialPlatforms = (socialRows ?? [])
      .map((row) =>
        typeof (row as { platform?: unknown }).platform === "string"
          ? (row as { platform: string }).platform
          : null,
      )
      .filter((platform): platform is string => !!platform);
  }

  const workspace = workspaceResult.data as {
    id: string;
    name: string;
    industry: string | null;
  } | null;

  const businessProfile = profileResult.data as {
    id: string;
    name: string;
    industry: string;
    tone: string;
    chat_persona: string | null;
    services: unknown;
    pricing_rules: unknown;
    approval_mode: string;
    workspace_id: string | null;
    timezone: string | null;
    high_value_threshold: number | null;
    high_risk_score: number | null;
    notification_prefs: unknown;
    chat_visuals_enabled: boolean | null;
    ai_monthly_token_budget: number | null;
  } | null;

  const subscription = subscriptionResult.data as {
    plan_tier: string | null;
    billing_cycle: string | null;
    status: string | null;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
  } | null;

  const gmailRow = gmailResult.data as {
    id: string;
    email_address: string;
    last_synced_at: string | null;
    sync_enabled: boolean;
    credential_type: string;
  } | null;

  const metaRows = (metaResult.data ?? []) as Array<{
    id: string;
    platform: string;
    page_name: string | null;
    ig_username: string | null;
    wa_display_phone: string | null;
    sync_enabled: boolean;
    last_synced_at: string | null;
  }>;

  const period = billingPeriodBounds(
    subscription?.current_period_start,
    subscription?.current_period_end,
  );

  const { count: messageCount, error: countError } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .gte("created_at", period.start)
    .lte("created_at", period.end);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const metaPlatforms = {} as WorkspaceSettings["channels"]["meta"]["platforms"];
  for (const platform of META_PLATFORMS) {
    metaPlatforms[platform] = {
      connected: false,
      page_name: null,
      ig_username: null,
      wa_display_phone: null,
      sync_enabled: false,
      last_synced_at: null,
      credential_id: null,
    };
  }

  for (const row of metaRows) {
    if (!(META_PLATFORMS as readonly string[]).includes(row.platform)) continue;
    const platform = row.platform as MetaChannelPlatform;
    metaPlatforms[platform] = {
      connected: true,
      page_name: row.page_name,
      ig_username: row.ig_username,
      wa_display_phone: row.wa_display_phone,
      sync_enabled: row.sync_enabled,
      last_synced_at: row.last_synced_at,
      credential_id: row.id,
    };
  }

  const planTier = subscription?.plan_tier ?? "starter";
  const messageLimit = messageLimitForPlan(planTier);
  const pricingRules = businessProfile?.pricing_rules ?? {};
  const highValueThreshold = numOrDefault(
    businessProfile?.high_value_threshold,
    HIGH_VALUE_THRESHOLD,
  );
  const highRiskScore = numOrDefault(businessProfile?.high_risk_score, HIGH_RISK_SCORE);

  const settings: WorkspaceSettings = {
    workspace: {
      id: workspace?.id ?? workspaceId,
      name: workspace?.name ?? businessProfile?.name ?? null,
      industry: workspace?.industry ?? businessProfile?.industry ?? null,
    },
    business_profile: businessProfile
      ? {
          id: businessProfile.id,
          name: businessProfile.name,
          industry: businessProfile.industry,
          tone: businessProfile.tone,
          chat_persona: businessProfile.chat_persona ?? null,
          services: parseServices(businessProfile.services),
          approval_mode: businessProfile.approval_mode,
          pricing_rules:
            pricingRules && typeof pricingRules === "object" && !Array.isArray(pricingRules)
              ? (pricingRules as Record<string, unknown>)
              : {},
          timezone: businessProfile.timezone,
          notification_prefs: parseNotificationPrefs(businessProfile.notification_prefs),
          chat_visuals_enabled: businessProfile.chat_visuals_enabled !== false,
          ai_monthly_token_budget:
            typeof businessProfile.ai_monthly_token_budget === "number"
              ? businessProfile.ai_monthly_token_budget
              : null,
        }
      : null,
    channels: {
      gmail: {
        connected: !!gmailRow,
        email: gmailRow?.email_address ?? null,
        last_synced_at: gmailRow?.last_synced_at ?? null,
        sync_enabled: gmailRow?.sync_enabled ?? false,
        credential_type: gmailRow?.credential_type ?? null,
        credential_id: gmailRow?.id ?? null,
      },
      meta: {
        connected: metaRows.length > 0,
        platforms: metaPlatforms,
      },
    },
    social: {
      connected: socialPlatforms.length > 0,
      platforms: socialPlatforms,
      platform_count: socialPlatforms.length,
    },
    billing: {
      plan_tier: planTier,
      billing_cycle: subscription?.billing_cycle ?? null,
      status: subscription?.status ?? null,
      trial_ends_at: subscription?.trial_ends_at ?? null,
      current_period_end: subscription?.current_period_end ?? null,
      message_count: messageCount ?? 0,
      message_limit: messageLimit,
      period_start: period.start,
      period_end: period.end,
    },
    security: {
      gmail_credential_present: !!gmailRow,
      meta_credentials_count: metaRows.length,
      tokens_encrypted: true,
      user_email: user.email ?? null,
    },
    policy: {
      high_value_threshold: highValueThreshold,
      high_risk_score: highRiskScore,
      thresholds_editable: !!businessProfile,
    },
    fields: {
      timezone_supported: true,
      currency_from_pricing_rules: readCurrency(pricingRules),
      notifications_supported: true,
      common_timezones: [...COMMON_TIMEZONES],
    },
    editable: {
      workspace_profile: !!businessProfile,
      ai_rules: !!businessProfile,
      channels: !!workspaceId,
    },
  };

  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const limited = rateLimit(request, "api:settings:patch", 20, 60_000);
  if (limited) return limited;

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body as SettingsPatchBody;
  const { supabase, teamId, workspaceId } = tenant;

  const { data: existing, error: fetchErr } = await supabase
    .from("business_profiles")
    .select(
      "id, pricing_rules, notification_prefs, high_value_threshold, high_risk_score",
    )
    .eq("team_id", teamId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json(
      { error: "Business profile not found for this workspace" },
      { status: 404 },
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let pricingRulesDirty = false;
  let nextPricingRules =
    existing.pricing_rules &&
    typeof existing.pricing_rules === "object" &&
    !Array.isArray(existing.pricing_rules)
      ? { ...(existing.pricing_rules as Record<string, unknown>) }
      : {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (body.industry !== undefined) {
    if (typeof body.industry !== "string" || !body.industry.trim()) {
      return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
    }
    updates.industry = body.industry.trim();
  }

  if (body.tone !== undefined) {
    if (typeof body.tone !== "string" || !body.tone.trim()) {
      return NextResponse.json({ error: "Invalid tone" }, { status: 400 });
    }
    updates.tone = body.tone.trim();
  }

  if (body.chat_persona !== undefined) {
    if (typeof body.chat_persona !== "string") {
      return NextResponse.json({ error: "Invalid chat_persona" }, { status: 400 });
    }
    const trimmed = body.chat_persona.trim().slice(0, 8000);
    // Empty string resets to the app default (stored as NULL).
    updates.chat_persona = trimmed.length > 0 ? trimmed : null;
  }

  if (body.services !== undefined) {
    if (!Array.isArray(body.services)) {
      return NextResponse.json({ error: "Invalid services" }, { status: 400 });
    }
    updates.services = parseServices(body.services);
  }

  if (body.approval_mode !== undefined) {
    if (
      typeof body.approval_mode !== "string" ||
      !APPROVAL_MODES.has(body.approval_mode)
    ) {
      return NextResponse.json({ error: "Invalid approval_mode" }, { status: 400 });
    }
    updates.approval_mode = body.approval_mode;
  }

  if (body.timezone !== undefined) {
    if (typeof body.timezone !== "string" || !isValidTimezone(body.timezone)) {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
    updates.timezone = body.timezone.trim();
  }

  if (body.currency !== undefined) {
    if (typeof body.currency !== "string" || !isValidCurrency(body.currency)) {
      return NextResponse.json({ error: "Invalid currency (use ISO 4217 code)" }, { status: 400 });
    }
    nextPricingRules = { ...nextPricingRules, currency: body.currency.trim().toUpperCase() };
    pricingRulesDirty = true;
  }

  if (body.high_value_threshold !== undefined) {
    if (
      typeof body.high_value_threshold !== "number" ||
      !Number.isFinite(body.high_value_threshold) ||
      body.high_value_threshold < 0
    ) {
      return NextResponse.json({ error: "Invalid high_value_threshold" }, { status: 400 });
    }
    updates.high_value_threshold = body.high_value_threshold;
  }

  if (body.high_risk_score !== undefined) {
    if (
      typeof body.high_risk_score !== "number" ||
      !Number.isFinite(body.high_risk_score) ||
      body.high_risk_score < 0 ||
      body.high_risk_score > 1
    ) {
      return NextResponse.json({ error: "Invalid high_risk_score (must be 0..1)" }, { status: 400 });
    }
    updates.high_risk_score = body.high_risk_score;
  }

  if (body.chat_visuals_enabled !== undefined) {
    if (typeof body.chat_visuals_enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid chat_visuals_enabled" }, { status: 400 });
    }
    updates.chat_visuals_enabled = body.chat_visuals_enabled;
  }

  if (body.ai_monthly_token_budget !== undefined) {
    // null clears the budget (alerts off); otherwise a non-negative integer token count.
    if (body.ai_monthly_token_budget === null) {
      updates.ai_monthly_token_budget = null;
    } else if (
      typeof body.ai_monthly_token_budget !== "number" ||
      !Number.isFinite(body.ai_monthly_token_budget) ||
      body.ai_monthly_token_budget < 0
    ) {
      return NextResponse.json({ error: "Invalid ai_monthly_token_budget" }, { status: 400 });
    } else {
      updates.ai_monthly_token_budget = Math.floor(body.ai_monthly_token_budget);
    }
  }

  const mergedNotificationPrefs = mergeNotificationPrefs(
    existing.notification_prefs,
    body.notification_prefs,
  );
  if (body.notification_prefs !== undefined && !mergedNotificationPrefs) {
    return NextResponse.json({ error: "Invalid notification_prefs" }, { status: 400 });
  }
  if (mergedNotificationPrefs) {
    updates.notification_prefs = mergedNotificationPrefs;
  }

  if (pricingRulesDirty) {
    updates.pricing_rules = nextPricingRules;
  }

  const channelPatch = body.channel !== undefined ? parseChannelPatch(body.channel) : null;
  if (body.channel !== undefined && !channelPatch) {
    return NextResponse.json({ error: "Invalid channel patch" }, { status: 400 });
  }

  if (channelPatch) {
    const channelErr = await applyChannelPatch(supabase, workspaceId, channelPatch);
    if (channelErr) {
      return NextResponse.json({ error: channelErr }, { status: 400 });
    }
  }

  const hasProfileUpdates = Object.keys(updates).length > 1;
  if (!hasProfileUpdates && !channelPatch) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if (hasProfileUpdates) {
    const { error: updateErr } = await supabase
      .from("business_profiles")
      .update(updates)
      .eq("team_id", teamId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (workspaceId && typeof updates.name === "string") {
      const { error: wsNameErr } = await supabase
        .from("workspaces")
        .update({ name: updates.name, updated_at: new Date().toISOString() })
        .eq("id", workspaceId)
        .eq("team_id", teamId);
      if (wsNameErr) {
        return NextResponse.json({ error: wsNameErr.message }, { status: 500 });
      }
    }

    if (workspaceId && typeof updates.industry === "string") {
      const { error: wsIndustryErr } = await supabase
        .from("workspaces")
        .update({ industry: updates.industry, updated_at: new Date().toISOString() })
        .eq("id", workspaceId)
        .eq("team_id", teamId);
      if (wsIndustryErr) {
        return NextResponse.json({ error: wsIndustryErr.message }, { status: 500 });
      }
    }
  }

  return GET();
}
