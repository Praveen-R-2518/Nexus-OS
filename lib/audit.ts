import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_LABEL = 128;

export type AuditTenantContext = {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
  user: { id: string };
};

export type SystemAuditContext = {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
};

export type AuditEventInput = {
  domain: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  prevState?: unknown;
  nextState?: unknown;
  metadata?: Record<string, unknown>;
};

export type AuditWriteResult =
  | { ok: true }
  | { ok: false; error: string };

function boundLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_LABEL);
}

function boundId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function boundMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

/**
 * Persist one audit row. Actor and tenant come from server context only —
 * never from a request body. Insert errors are returned so callers can fail closed.
 */
export async function writeAuditEvent(
  ctx: AuditTenantContext,
  event: AuditEventInput,
): Promise<AuditWriteResult> {
  const teamId = boundId(ctx.teamId);
  const actorUserId = boundId(ctx.user?.id);
  if (!teamId || !actorUserId) {
    return { ok: false, error: "Missing tenant or actor context" };
  }

  const domain = boundLabel(event.domain);
  const action = boundLabel(event.action);
  const entityType = boundLabel(event.entityType);
  if (!domain || !action || !entityType) {
    return { ok: false, error: "domain, action, and entityType are required" };
  }

  const workspaceId = boundId(ctx.workspaceId);
  const row = {
    team_id: teamId,
    workspace_id: workspaceId,
    actor_user_id: actorUserId,
    domain,
    action,
    entity_type: entityType,
    entity_id: boundId(event.entityId),
    prev_state: event.prevState ?? null,
    next_state: event.nextState ?? null,
    metadata: boundMetadata(event.metadata),
  };

  try {
    const { error } = await ctx.supabase.from("audit_events").insert(row);
    if (error) {
      return { ok: false, error: error.message || "Failed to write audit event" };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write audit event";
    return { ok: false, error: message };
  }
}

/**
 * Persist one audit row with a null actor (service-role system writes).
 * Tenant comes from server context only — never from a request body.
 */
export async function writeSystemAuditEvent(
  ctx: SystemAuditContext,
  event: AuditEventInput,
): Promise<AuditWriteResult> {
  const teamId = boundId(ctx.teamId);
  if (!teamId) {
    return { ok: false, error: "Missing tenant context" };
  }

  const domain = boundLabel(event.domain);
  const action = boundLabel(event.action);
  const entityType = boundLabel(event.entityType);
  if (!domain || !action || !entityType) {
    return { ok: false, error: "domain, action, and entityType are required" };
  }

  const workspaceId = boundId(ctx.workspaceId);
  const row = {
    team_id: teamId,
    workspace_id: workspaceId,
    actor_user_id: null,
    domain,
    action,
    entity_type: entityType,
    entity_id: boundId(event.entityId),
    prev_state: event.prevState ?? null,
    next_state: event.nextState ?? null,
    metadata: boundMetadata(event.metadata),
  };

  try {
    const { error } = await ctx.supabase.from("audit_events").insert(row);
    if (error) {
      return { ok: false, error: error.message || "Failed to write audit event" };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write audit event";
    return { ok: false, error: message };
  }
}
