/**
 * Nexus OS — Tenant route extraction and business_profiles REST helpers (n8n + Node tests).
 * Used by WF0a intake Code nodes (inlined via build script) and by unit tests.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function getEnv(name) {
  const key = String(name || "").trim();
  if (!key) return "";
  if (typeof $env !== "undefined" && $env[key] != null && String($env[key]).trim()) {
    return String($env[key]).trim();
  }
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return String(process.env[key]).trim();
  }
  return "";
}

function lowerHeaderMap(headers) {
  if (!headers || typeof headers !== "object") return {};
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), v == null ? "" : String(v).trim()]),
  );
}

function firstEmailFromHeaderValue(val) {
  const s = val == null ? "" : String(val).trim();
  if (!s) return "";
  const angled = s.match(/<([^>]+@[^>]+)>/);
  if (angled) return angled[1].trim().toLowerCase();
  const bare = s.match(/([\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,})/);
  return bare ? bare[1].trim().toLowerCase() : "";
}

/**
 * @param {object} raw - Unwrapped intake (IMAP item or webhook body + headers merged)
 * @param {string} envMailbox - NEXUS_GMAIL_DESTINATION_MAILBOX
 */
function extractGmailDestinationMailbox(raw, envMailbox) {
  const headers = raw.headers || raw.header || {};
  const h = Array.isArray(raw.headerLines)
    ? {}
    : lowerHeaderMap(headers);

  if (!Array.isArray(raw.headerLines)) {
    const candidates = ["delivered-to", "x-original-to", "to", "envelope-to"];
    for (const name of candidates) {
      const v = h[name];
      if (v) {
        const em = firstEmailFromHeaderValue(v);
        if (em) return em;
      }
    }
  } else {
    for (const line of raw.headerLines) {
      const idx = String(line).indexOf(":");
      if (idx <= 0) continue;
      const k = String(line).slice(0, idx).trim().toLowerCase();
      if (!["delivered-to", "x-original-to", "to", "envelope-to"].includes(k)) continue;
      const em = firstEmailFromHeaderValue(String(line).slice(idx + 1));
      if (em) return em;
    }
  }

  const directTo = raw.to || raw.To;
  if (directTo) {
    const em = firstEmailFromHeaderValue(directTo);
    if (em) return em;
  }

  const fallback = String(envMailbox || "").trim().toLowerCase();
  if (fallback) return fallback;
  return "";
}

function extractBearerFromHeaders(headersLower, headerName) {
  const name = String(headerName || "x-nexus-webhook-token").trim().toLowerCase();
  const direct = headersLower[name];
  if (direct) return direct.trim();
  const auth = headersLower.authorization || headersLower.Authorization || "";
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return "";
}

function normalizeRoutingNumber(num) {
  return String(num || "").replace(/\s+/g, "").trim();
}

/**
 * WhatsApp / Meta Cloud-ish routing hints from body or headers.
 */
function extractWhatsappRoutingNumber(raw, envFallback) {
  const body = raw && typeof raw === "object" ? raw : {};
  const entry = body.entry && body.entry[0];
  const change = entry && entry.changes && entry.changes[0];
  const value = change && change.value;
  const meta =
    value &&
    value.metadata &&
    (value.metadata.display_phone_number || value.metadata.phone_number_id);
  if (meta) return normalizeRoutingNumber(meta);

  const msg = value && value.messages && value.messages[0];
  if (msg && (msg.to || msg.recipient_id)) return normalizeRoutingNumber(msg.to || msg.recipient_id);

  const h = lowerHeaderMap(body.headers);
  const hdr = getEnv("NEXUS_WHATSAPP_DEST_HEADER") || "x-whatsapp-to";
  if (h[hdr.toLowerCase()]) return normalizeRoutingNumber(h[hdr.toLowerCase()]);

  const q = body.query && typeof body.query === "object" ? body.query : {};
  if (q.to) return normalizeRoutingNumber(q.to);
  if (q.phone_number) return normalizeRoutingNumber(q.phone_number);

  return normalizeRoutingNumber(envFallback);
}

function isProbablyWhatsappPayload(merged) {
  const body = merged && typeof merged === "object" ? merged : {};
  if (body && Array.isArray(body.entry) && body.entry[0] && body.entry[0].changes) return true;
  const ch = String(body.channel || "").toLowerCase();
  if (ch === "whatsapp") return true;
  const h = lowerHeaderMap(body.headers);
  if (String(h["x-nexus-channel"] || "").toLowerCase() === "whatsapp") return true;
  return false;
}

/**
 * Flatten n8n Webhook `{ headers, body, query }` and IMAP items for routing + intake.
 */
function mergeTriggerForRouting(root) {
  const j = root || {};
  const h = j.headers && typeof j.headers === "object" ? j.headers : {};
  const q = j.query && typeof j.query === "object" ? j.query : {};
  const b = typeof j.body === "object" && j.body !== null ? j.body : {};
  return {
    ...b,
    headers: b.headers && typeof b.headers === "object" ? { ...h, ...b.headers } : { ...h },
    query: b.query && typeof b.query === "object" ? { ...q, ...b.query } : { ...q },
  };
}

/**
 * Decide lookup route: webhook_token > whatsapp_number > gmail_mailbox.
 *
 * @returns {{ type: 'webhook_token'|'whatsapp_number'|'gmail_mailbox', value: string }}
 */
function resolveRouteFromIntake(root) {
  const merged = mergeTriggerForRouting(root);
  const headersLower = lowerHeaderMap(merged.headers);
  const tokenHeaderName = getEnv("NEXUS_WHATSAPP_TOKEN_HEADER") || "x-nexus-webhook-token";
  const q = merged.query && typeof merged.query === "object" ? merged.query : {};
  const token =
    extractBearerFromHeaders(headersLower, tokenHeaderName) ||
    (q.token ? String(q.token).trim() : "");

  if (token) {
    return { type: "webhook_token", value: token };
  }

  if (isProbablyWhatsappPayload(merged)) {
    const wa = extractWhatsappRoutingNumber(merged, getEnv("NEXUS_WHATSAPP_DESTINATION_NUMBER"));
    if (wa) return { type: "whatsapp_number", value: wa };
  }

  const gmail = extractGmailDestinationMailbox(merged, getEnv("NEXUS_GMAIL_DESTINATION_MAILBOX"));
  if (gmail) return { type: "gmail_mailbox", value: gmail };

  throw new Error(
    "tenant_route_resolver: could not resolve tenant route (set NEXUS_GMAIL_DESTINATION_MAILBOX for IMAP, or WhatsApp/token headers)",
  );
}

/**
 * Build `business_profiles` lookup query path starting with `?`.
 */
function buildBusinessProfileLookupPath(route) {
  if (!route || !route.type || !route.value) {
    throw new Error("tenant_route_resolver: invalid route for profile lookup");
  }
  const v = String(route.value).trim();
  const enc = encodeURIComponent(v);
  const base = "?select=id,team_id,workspace_id&limit=2";
  if (route.type === "gmail_mailbox") {
    return `${base}&gmail_destination_email=eq.${encodeURIComponent(v.toLowerCase())}`;
  }
  if (route.type === "whatsapp_number") {
    return `${base}&whatsapp_routing_number=eq.${enc}`;
  }
  if (route.type === "webhook_token") {
    return `${base}&webhook_route_token=eq.${enc}`;
  }
  throw new Error(`tenant_route_resolver: unknown route type ${route.type}`);
}

/**
 * @param {unknown} rows - JSON array from Supabase
 * @returns {{ id: string, team_id: string, workspace_id: string|null }}
 */
function verifySingleBusinessProfile(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    throw new Error("tenant_route_resolver: no business_profiles row matched this route");
  }
  if (list.length > 1) {
    throw new Error("tenant_route_resolver: ambiguous business_profiles match (multiple rows)");
  }
  const row = list[0];
  if (!row || !row.team_id) {
    throw new Error("tenant_route_resolver: matched profile has no team_id");
  }
  return {
    id: String(row.id),
    team_id: String(row.team_id),
    workspace_id: row.workspace_id != null ? String(row.workspace_id) : null,
  };
}

/**
 * Shape a webhook root `{ headers, body, query }` or IMAP item into `__intake` for the normalizer.
 */
function buildIntakeEnvelope(triggerJson) {
  const j = triggerJson || {};
  if (j.body !== undefined && (j.headers || j.query !== undefined)) {
    const inner = typeof j.body === "object" && j.body !== null ? { ...j.body } : {};
    inner.headers = j.headers || inner.headers || {};
    inner.query = j.query || inner.query || {};
    return inner;
  }
  return { ...j };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getEnv,
    extractGmailDestinationMailbox,
    extractWhatsappRoutingNumber,
    resolveRouteFromIntake,
    buildBusinessProfileLookupPath,
    verifySingleBusinessProfile,
    buildIntakeEnvelope,
    isProbablyWhatsappPayload,
    mergeTriggerForRouting,
    isUuid,
  };
}
