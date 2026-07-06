import { createServerClient } from "@/lib/supabase";

/**
 * Deterministic Meta → tenant resolution at the EDGE (Next.js webhook).
 *
 * Decision (NEXUS_REBUILD_CONTEXT.md §5): the tenant is resolved here, NOT in n8n, so the durable
 * `inbound_events` ledger is tenant-stamped at write time and routing lives in one typed place. The
 * conversation WRITE still happens in n8n — this module only extracts the routing key, looks up the
 * owning `business_profiles` row, and returns the tenant for stamping + the n8n forward.
 *
 * Pure + unit-testable: `extractMetaRoute` has no I/O, and `resolveMetaTenant` takes an injectable
 * `lookup` so tests need no database. The default lookup uses the service-role Supabase client.
 */

export type MetaPlatform = "whatsapp" | "instagram" | "facebook";

export interface MetaRoute {
  platform: MetaPlatform;
  /** WhatsApp → phone_number_id · Instagram → ig account id · Facebook → page id. */
  routingKey: string;
}

export interface MetaTenant {
  workspace_id: string | null;
  team_id: string;
  platform: MetaPlatform;
}

/**
 * Resolve a routing key to its owning tenant, or null when unmatched/ambiguous. Injectable so the
 * webhook path uses Supabase while tests pass a pure in-memory map.
 */
export type MetaTenantLookup = (
  route: MetaRoute,
) => Promise<{ workspace_id: string | null; team_id: string } | null>;

/** `business_profiles` column that holds each platform's routing key. */
const COLUMN_BY_PLATFORM: Record<MetaPlatform, string> = {
  whatsapp: "wa_phone_number_id",
  instagram: "ig_account_id",
  facebook: "fb_page_id",
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function firstRecipientId(messaging: unknown[]): string {
  for (const evt of messaging) {
    const m = asObject(evt);
    if (!m) continue;
    const recipient = asObject(m.recipient);
    if (recipient && recipient.id != null) {
      const id = String(recipient.id).trim();
      if (id) return id;
    }
  }
  return "";
}

/**
 * Extract the platform + routing key from a raw Meta webhook payload. Pure.
 *
 * - WhatsApp Cloud API → `entry[].changes[].value.metadata.phone_number_id` (platform `whatsapp`).
 * - Instagram messaging → recipient id (the business IG-scoped id), falling back to `entry[].id`.
 * - Facebook (page) messaging → `entry[].id` (page id), falling back to recipient id.
 *
 * The owning platform for `messaging` events is derived from the top-level `object`
 * (`instagram` → Instagram, otherwise the Facebook page). Returns null when no routing key is found.
 */
export function extractMetaRoute(payload: unknown): MetaRoute | null {
  const root = asObject(payload);
  if (!root) return null;

  const object = typeof root.object === "string" ? root.object.toLowerCase() : "";
  const entries = Array.isArray(root.entry) ? root.entry : [];

  for (const entry of entries) {
    const e = asObject(entry);
    if (!e) continue;

    // WhatsApp Cloud API: phone_number_id is the durable routing key (display_phone_number is
    // cosmetic and can change formatting, so we never route on it).
    const changes = Array.isArray(e.changes) ? e.changes : [];
    for (const change of changes) {
      const c = asObject(change);
      if (!c) continue;
      const value = asObject(c.value);
      if (!value) continue;
      const metadata = asObject(value.metadata);
      if (metadata && metadata.phone_number_id != null) {
        const pnid = String(metadata.phone_number_id).trim();
        if (pnid) return { platform: "whatsapp", routingKey: pnid };
      }
    }

    // Messenger / Instagram messaging.
    const messaging = Array.isArray(e.messaging) ? e.messaging : [];
    if (messaging.length > 0) {
      const platform: MetaPlatform = object === "instagram" ? "instagram" : "facebook";
      const entryId = e.id != null ? String(e.id).trim() : "";
      const recipientId = firstRecipientId(messaging);
      // Instagram: the IG-scoped business id arrives as the recipient; Facebook: the page id is the
      // entry id. Mirror tenant_route_resolver.js preference order so both code paths agree.
      const key =
        platform === "instagram"
          ? recipientId || entryId
          : entryId || recipientId;
      if (key) return { platform, routingKey: key };
    }
  }

  return null;
}

/**
 * Default lookup: match the routing key against `business_profiles` using the service-role client.
 * Returns null on no match OR an ambiguous (>1) match — routing must be unambiguous to be trusted.
 */
async function defaultLookup(
  route: MetaRoute,
): Promise<{ workspace_id: string | null; team_id: string } | null> {
  const supabase = createServerClient();
  const column = COLUMN_BY_PLATFORM[route.platform];

  const { data, error } = await supabase
    .from("business_profiles")
    .select("team_id, workspace_id")
    .eq(column, route.routingKey)
    .limit(2);

  if (error || !Array.isArray(data) || data.length !== 1) return null;

  const row = data[0] as { team_id?: unknown; workspace_id?: unknown };
  if (!row.team_id) return null;
  return {
    team_id: String(row.team_id),
    workspace_id: row.workspace_id != null ? String(row.workspace_id) : null,
  };
}

/**
 * Resolve a Meta webhook payload to its owning tenant. Returns null when the payload carries no
 * routing key or the key matches no (single) `business_profiles` row.
 */
export async function resolveMetaTenant(
  payload: unknown,
  lookup: MetaTenantLookup = defaultLookup,
): Promise<MetaTenant | null> {
  const route = extractMetaRoute(payload);
  if (!route) return null;

  const match = await lookup(route);
  if (!match) return null;

  return {
    workspace_id: match.workspace_id,
    team_id: match.team_id,
    platform: route.platform,
  };
}
