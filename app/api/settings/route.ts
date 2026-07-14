import { NextResponse } from "next/server";
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
import type { MetaChannelPlatform, WorkspaceSettings } from "@/types";

export const dynamic = "force-dynamic";

const APPROVAL_MODES = new Set(["approval_queue", "autopilot"]);

type SettingsPatchBody = {
  name?: unknown;
  industry?: unknown;
  tone?: unknown;
  services?: unknown;
  approval_mode?: unknown;
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
        "id, name, industry, tone, services, pricing_rules, approval_mode, workspace_id",
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
            "platform, page_name, ig_username, wa_display_phone, sync_enabled, last_synced_at, status",
          )
          .eq("workspace_id", workspaceId)
          .eq("status", "connected")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const queryError =
    workspaceResult.error ??
    profileResult.error ??
    subscriptionResult.error ??
    gmailResult.error ??
    metaResult.error;

  if (queryError) {
    return NextResponse.json({ error: queryError.message }, { status: 500 });
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
    services: unknown;
    pricing_rules: unknown;
    approval_mode: string;
    workspace_id: string | null;
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
    email_address: string;
    last_synced_at: string | null;
    sync_enabled: boolean;
    credential_type: string;
  } | null;

  const metaRows = (metaResult.data ?? []) as Array<{
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
    };
  }

  const planTier = subscription?.plan_tier ?? "starter";
  const messageLimit = messageLimitForPlan(planTier);
  const pricingRules = businessProfile?.pricing_rules ?? {};

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
          services: parseServices(businessProfile.services),
          approval_mode: businessProfile.approval_mode,
          pricing_rules:
            pricingRules && typeof pricingRules === "object" && !Array.isArray(pricingRules)
              ? (pricingRules as Record<string, unknown>)
              : {},
        }
      : null,
    channels: {
      gmail: {
        connected: !!gmailRow,
        email: gmailRow?.email_address ?? null,
        last_synced_at: gmailRow?.last_synced_at ?? null,
        sync_enabled: gmailRow?.sync_enabled ?? false,
        credential_type: gmailRow?.credential_type ?? null,
      },
      meta: {
        connected: metaRows.length > 0,
        platforms: metaPlatforms,
      },
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
      high_value_threshold: HIGH_VALUE_THRESHOLD,
      high_risk_score: HIGH_RISK_SCORE,
      thresholds_editable: false,
    },
    fields: {
      timezone_supported: false,
      currency_from_pricing_rules: readCurrency(pricingRules),
      notifications_supported: false,
    },
    editable: {
      workspace_profile: !!businessProfile,
      ai_rules: !!businessProfile,
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
    .select("id")
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

  if (body.services !== undefined) {
    if (!Array.isArray(body.services)) {
      return NextResponse.json({ error: "Invalid services" }, { status: 400 });
    }
    const services = parseServices(body.services);
    updates.services = services;
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

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

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

  return GET();
}
