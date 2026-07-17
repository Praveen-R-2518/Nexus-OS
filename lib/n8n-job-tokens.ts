import "server-only";

import { createHash, randomBytes } from "crypto";
import { createServerClient } from "@/lib/supabase";

/**
 * Short-lived, single-use n8n job tokens (docs/n8n_workspace_env.md).
 *
 * Unlike the broad `N8N_INGEST_TOKEN` / `N8N_BOOTSTRAP_TOKEN`, a job token is minted for ONE
 * action bound to a specific team/workspace/resource, expires quickly, and is burned on first
 * use (`private.n8n_job_tokens`, migration 20260717130000 + RPCs in 20260717131000). Only the
 * SHA-256 hash is ever persisted — the plaintext token is returned once, at issue time, and
 * never stored or logged.
 */

export type N8nJobTokenBindings = {
  teamId?: string | null;
  workspaceId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
};

export type IssueN8nJobTokenOptions = N8nJobTokenBindings & {
  action: string;
  organizationId?: string | null;
  /** Defaults to 15 minutes; capped at 1 hour. */
  ttlSeconds?: number;
};

export type N8nJobTokenClaims = {
  id: string;
  action: string;
  teamId: string | null;
  workspaceId: string | null;
  organizationId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  expiresAt: string;
};

export type ConsumeN8nJobTokenResult =
  | { ok: true; claims: N8nJobTokenClaims }
  | { ok: false; status: number; error: string };

const DEFAULT_TTL_SECONDS = 15 * 60;
const MAX_TTL_SECONDS = 60 * 60;

/** SHA-256 of the raw token. Only the hash is ever sent to Postgres or persisted. */
export function hashToken(raw: string): Buffer {
  return createHash("sha256").update(raw, "utf8").digest();
}

/** Postgres `bytea` hex-format input (`\x...`) for a hashed token, sent as a plain RPC param. */
function toBytea(buf: Buffer): string {
  return `\\x${buf.toString("hex")}`;
}

function normalizeUuid(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeText(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Mints a new job token for `opts.action`, optionally bound to a team/workspace/organization
 * and a specific resource (e.g. `{resourceType: "draft", resourceId: draftId}`). Returns the
 * plaintext token exactly once — the caller must hand it to n8n immediately; it cannot be
 * retrieved again.
 */
export async function issueN8nJobToken(
  opts: IssueN8nJobTokenOptions,
): Promise<{ token: string; expiresAt: string }> {
  const action = opts.action?.trim();
  if (!action) {
    throw new Error("issueN8nJobToken: action is required");
  }

  const ttlSeconds = Math.min(
    Math.max(1, Math.floor(opts.ttlSeconds ?? DEFAULT_TTL_SECONDS)),
    MAX_TTL_SECONDS,
  );
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const raw = randomBytes(32).toString("hex");
  const hash = hashToken(raw);

  const supabase = createServerClient();
  const { error } = await supabase.rpc("issue_n8n_job_token", {
    p_token_hash: toBytea(hash),
    p_action: action,
    p_team_id: normalizeUuid(opts.teamId),
    p_workspace_id: normalizeUuid(opts.workspaceId),
    p_organization_id: normalizeUuid(opts.organizationId),
    p_resource_type: normalizeText(opts.resourceType),
    p_resource_id: normalizeUuid(opts.resourceId),
    p_expires_at: expiresAt,
  });

  if (error) {
    throw new Error(`issueN8nJobToken: ${error.message}`);
  }

  return { token: raw, expiresAt };
}

type ConsumeRpcRow = {
  ok?: boolean;
  id?: string;
  action?: string;
  team_id?: string | null;
  workspace_id?: string | null;
  organization_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  expires_at?: string;
};

/**
 * Validates and single-use-burns a job token for `expectedAction`. Any caller-supplied
 * `bindings` field must match what the token was issued with; omitted fields are not checked.
 * Fails closed (`{ok:false}`) on any mismatch, expiry, reuse, or unexpected error — never
 * throws, so a route can safely fall back to bootstrap-token auth during the migration.
 */
export async function consumeN8nJobToken(
  rawToken: string,
  expectedAction: string,
  bindings?: N8nJobTokenBindings,
): Promise<ConsumeN8nJobTokenResult> {
  const token = rawToken?.trim();
  if (!token) {
    return { ok: false, status: 401, error: "Missing job token" };
  }

  const action = expectedAction?.trim();
  if (!action) {
    return { ok: false, status: 500, error: "consumeN8nJobToken: expectedAction is required" };
  }

  const hash = hashToken(token);

  let data: unknown;
  let error: { message: string } | null;
  try {
    const supabase = createServerClient();
    const result = await supabase.rpc("consume_n8n_job_token", {
      p_token_hash: toBytea(hash),
      p_action: action,
      p_team_id: normalizeUuid(bindings?.teamId),
      p_workspace_id: normalizeUuid(bindings?.workspaceId),
      p_resource_type: normalizeText(bindings?.resourceType),
      p_resource_id: normalizeUuid(bindings?.resourceId),
    });
    data = result.data;
    error = result.error ?? null;
  } catch (err) {
    return {
      ok: false,
      status: 401,
      error: err instanceof Error ? err.message : "Unable to verify job token",
    };
  }

  if (error) {
    return { ok: false, status: 401, error: "Unable to verify job token" };
  }

  const row = (data ?? null) as ConsumeRpcRow | null;
  if (!row || row.ok !== true || !row.id) {
    return { ok: false, status: 401, error: "Invalid, expired, or already-used job token" };
  }

  return {
    ok: true,
    claims: {
      id: row.id,
      action: row.action ?? action,
      teamId: row.team_id ?? null,
      workspaceId: row.workspace_id ?? null,
      organizationId: row.organization_id ?? null,
      resourceType: row.resource_type ?? null,
      resourceId: row.resource_id ?? null,
      expiresAt: row.expires_at ?? "",
    },
  };
}
