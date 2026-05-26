/**
 * Nexus OS - Multi-channel intake normalizer (n8n Code node)
 *
 * Converts Gmail/IMAP, WhatsApp (Meta-style), and demo webhook payloads into the
 * canonical object for the noise filter and WF2. Requires a verified tenant from
 * upstream **Verify Tenant Context** (`_tenant.team_id`).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function readVerifiedTenant(rawInput) {
  const raw = rawInput || {};
  const t = raw._tenant;
  if (!t || typeof t !== "object" || !isUuid(t.team_id)) {
    throw new Error(
      "multi_channel_normalizer: missing verified _tenant.team_id (run Verify Tenant Context before this node)",
    );
  }
  return {
    team_id: String(t.team_id).trim(),
    workspace_id: t.workspace_id != null && isUuid(t.workspace_id) ? String(t.workspace_id).trim() : null,
    business_profile_id:
      t.business_profile_id != null && isUuid(t.business_profile_id)
        ? String(t.business_profile_id).trim()
        : null,
    route_source: t.route_source != null ? String(t.route_source) : "",
    route_key: t.route_key != null ? String(t.route_key) : "",
  };
}

function attachTenant(canonical, tenant) {
  const out = {
    ...canonical,
    team_id: tenant.team_id,
    tenant_route_source: tenant.route_source,
    tenant_route_key: tenant.route_key,
  };
  if (tenant.workspace_id) out.workspace_id = tenant.workspace_id;
  if (tenant.business_profile_id) out.business_profile_id = tenant.business_profile_id;
  return out;
}

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripQuotedLines(text) {
  if (!text || typeof text !== "string") return "";
  const withoutGtQuotes = text
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  return withoutGtQuotes.replace(/\n{3,}/g, "\n\n").trim();
}

function stripSignatureAndQuotes(text) {
  if (!text || typeof text !== "string") return "";
  let t = text.replace(/\r\n/g, "\n");

  const idx = t.search(/^On .+ wrote:\s*$/im);
  if (idx !== -1) t = t.slice(0, idx).trim();

  const sigDash = t.split(/^--\s*$/m);
  if (sigDash.length > 1) t = sigDash[0].trim();

  const sentFrom = t.split(/^Sent from my .+$/im);
  if (sentFrom.length > 1) t = sentFrom[0].trim();

  return t.trim();
}

function valueText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value.text === "string") return value.text;
  if (typeof value.value === "string") return value.value;
  if (Array.isArray(value) && value[0]) return valueText(value[0]);
  return String(value || "");
}

function parseFromHeader(from) {
  const text = valueText(from).trim();
  if (!text) return { customer_name: "", customer_email_or_phone: "" };

  const angled = /^\s*"?([^"<]*?)"?\s*<\s*([^>]+)\s*>\s*$/;
  const m = text.match(angled);
  if (m) {
    const name = (m[1] || "").replace(/^"|"$/g, "").trim();
    const email = (m[2] || "").trim().toLowerCase();
    return {
      customer_name: name || titleCaseFromEmail(email),
      customer_email_or_phone: email,
    };
  }

  const bare = text.match(/^([\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,})$/);
  if (bare) {
    const email = bare[1].toLowerCase();
    return {
      customer_name: titleCaseFromEmail(email),
      customer_email_or_phone: email,
    };
  }

  return { customer_name: text, customer_email_or_phone: "" };
}

function titleCaseFromEmail(email) {
  const local = (email || "").split("@")[0] || "";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function parseHeaders(raw) {
  const headers = raw.headers || raw.header || {};
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    return Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [String(k).toLowerCase(), valueText(v)]),
    );
  }
  if (Array.isArray(raw.headerLines)) {
    const out = {};
    for (const line of raw.headerLines) {
      const idx = String(line).indexOf(":");
      if (idx > 0) out[String(line).slice(0, idx).trim().toLowerCase()] = String(line).slice(idx + 1).trim();
    }
    return out;
  }
  return {};
}

function unwrapBody(payload) {
  if (payload && typeof payload === "object" && payload.body !== undefined) {
    const inner =
      typeof payload.body === "object" && payload.body !== null ? { ...payload.body } : {};
    if (payload.headers && typeof payload.headers === "object") {
      inner.headers = { ...(typeof inner.headers === "object" ? inner.headers : {}), ...payload.headers };
    }
    if (payload.query && typeof payload.query === "object") {
      inner.query = { ...(typeof inner.query === "object" ? inner.query : {}), ...payload.query };
    }
    if (payload._tenant) inner._tenant = payload._tenant;
    return inner;
  }
  return payload;
}

function stripAngleId(v) {
  return String(v || "").replace(/[<>]/g, "").trim();
}

function threadKey(raw, headers) {
  if (raw.threadId) return String(raw.threadId);
  if (raw.thread_id) return String(raw.thread_id);
  if (raw.id) return `gmail:${raw.id}`;
  if (headers["in-reply-to"]) return `msg:${stripAngleId(headers["in-reply-to"])}`;
  if (headers["message-id"]) return `msg:${stripAngleId(headers["message-id"])}`;
  return null;
}

function looksLikeMetaWhatsapp(raw) {
  const r = raw || {};
  return Boolean(r.entry && Array.isArray(r.entry) && r.entry[0] && r.entry[0].changes);
}

function detectSource(rawInput) {
  const raw = unwrapBody(rawInput) || {};
  const explicit = raw.__source || raw.source;
  if (explicit) {
    const e = String(explicit).toLowerCase();
    if (e === "whatsapp") return "whatsapp";
    if (["gmail", "demo"].includes(e)) return e;
  }
  const ch = String(raw.channel || "").toLowerCase();
  if (ch === "whatsapp") return "whatsapp";
  if (raw.customer_email && raw.message) return "demo";
  if (looksLikeMetaWhatsapp(raw)) return "whatsapp";
  if (
    raw.from ||
    raw.From ||
    raw.subject ||
    raw.textPlain !== undefined ||
    raw.text !== undefined ||
    raw.html !== undefined ||
    raw.textHtml !== undefined
  ) {
    return "gmail";
  }
  throw new Error("multi_channel_normalizer: could not detect gmail, whatsapp, or demo payload");
}

function parseGmail(rawInput) {
  const raw = unwrapBody(rawInput) || {};
  const headers = parseHeaders(raw);
  const fromField = raw.from || raw.From || headers.from || "";
  const { customer_name, customer_email_or_phone } = parseFromHeader(fromField);

  let body =
    valueText(raw.textPlain) ||
    valueText(raw.text) ||
    valueText(raw.textAsHtml) ||
    valueText(raw.textHtml);
  if (!body && raw.html) body = stripHtml(valueText(raw.html));
  if (raw.textAsHtml && body === valueText(raw.textAsHtml)) body = stripHtml(body);
  if (raw.textHtml && body === valueText(raw.textHtml)) body = stripHtml(body);

  const message = stripQuotedLines(stripSignatureAndQuotes(body));
  const subject = valueText(raw.subject || headers.subject);
  const dateValue = raw.date || raw.dateUtc || raw.internalDate || raw.receivedDate || new Date().toISOString();
  const receivedAt = typeof dateValue === "number" ? new Date(dateValue).toISOString() : new Date(dateValue).toISOString();

  return {
    source: "gmail",
    customer_name,
    customer_email_or_phone,
    message,
    external_thread_id: threadKey(raw, headers),
    received_at: receivedAt,
    raw_payload: rawInput,
    _filter: {
      from_header: valueText(fromField),
      subject,
      list_unsubscribe: !!(headers["list-unsubscribe"] || headers["list_unsubscribe"]),
      auto_submitted: headers["auto-submitted"] || headers["auto_submitted"] || "",
      has_attachment: !!(raw.attachments && raw.attachments.length),
      body_for_rules: message,
    },
  };
}

function parseDemo(rawInput) {
  const raw = unwrapBody(rawInput) || {};
  return {
    source: raw.source || "demo",
    customer_name: String(raw.customer_name || "").trim(),
    customer_email_or_phone: String(raw.customer_email || raw.customer_email_or_phone || "").trim().toLowerCase(),
    message: String(raw.message || "").trim(),
    external_thread_id: raw.threadId || raw.thread_id || null,
    received_at: raw.received_at || new Date().toISOString(),
    raw_payload: rawInput,
    _filter: {
      from_header: raw.customer_email || "",
      subject: raw.subject || "",
      list_unsubscribe: false,
      auto_submitted: "",
      has_attachment: false,
      body_for_rules: String(raw.message || "").trim(),
    },
  };
}

function parseWhatsapp(rawInput) {
  const raw = unwrapBody(rawInput) || {};

  if (looksLikeMetaWhatsapp(raw)) {
    const value = raw.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    const contacts = value?.contacts || [];
    const profileName = contacts[0]?.profile?.name || "";
    const waFrom = msg?.from ? String(msg.from).trim() : "";
    const bodyText =
      (msg?.text && msg.text.body) ||
      (msg?.button && msg.button.text) ||
      (msg?.interactive && msg.interactive?.nfm_reply?.response_json) ||
      "";

    const ts = msg?.timestamp;
    let receivedAt = new Date().toISOString();
    if (ts != null) {
      const n = Number(ts);
      if (Number.isFinite(n)) {
        receivedAt = new Date(n < 1e12 ? n * 1000 : n).toISOString();
      }
    }

    return {
      source: "webhook",
      channel: "whatsapp",
      customer_name: String(profileName || "").trim(),
      customer_email_or_phone: waFrom,
      message: String(bodyText || "").trim(),
      external_thread_id: msg?.id ? `wa:${msg.id}` : null,
      received_at: receivedAt,
      raw_payload: rawInput,
      _filter: {
        from_header: waFrom,
        subject: "",
        list_unsubscribe: false,
        auto_submitted: "",
        has_attachment: false,
        body_for_rules: String(bodyText || "").trim(),
      },
    };
  }

  const message = String(raw.message || raw.text || raw.body || "").trim();
  const waFrom = String(raw.from || raw.wa_id || raw.customer_phone || "").trim();
  return {
    source: "webhook",
    channel: "whatsapp",
    customer_name: String(raw.profile_name || raw.customer_name || "").trim(),
    customer_email_or_phone: waFrom,
    message,
    external_thread_id: raw.message_id ? `wa:${raw.message_id}` : null,
    received_at: raw.received_at || new Date().toISOString(),
    raw_payload: rawInput,
    _filter: {
      from_header: waFrom,
      subject: String(raw.subject || "").trim(),
      list_unsubscribe: false,
      auto_submitted: "",
      has_attachment: false,
      body_for_rules: message,
    },
  };
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("multi_channel_normalizer: invalid input item");
  }
  if (raw.error) {
    throw new Error(String(raw.error));
  }
  const tenant = readVerifiedTenant(raw);
  const source = detectSource(raw);
  if (source === "gmail") return attachTenant(parseGmail(raw), tenant);
  if (source === "demo") return attachTenant(parseDemo(raw), tenant);
  if (source === "whatsapp") return attachTenant(parseWhatsapp(raw), tenant);
  throw new Error(`multi_channel_normalizer: unsupported source "${source}"`);
}

if (typeof $input !== "undefined") {
  try {
    return $input.all().map(({ json }) => ({ json: normalizeItem(json) }));
  } catch (error) {
    return [
      {
        json: {
          error: error.message,
          node: "MultiChannelNormalizer",
          timestamp: new Date().toISOString(),
        },
      },
    ];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeItem,
    detectSource,
    parseGmail,
    parseDemo,
    parseWhatsapp,
    readVerifiedTenant,
    attachTenant,
    isUuid,
    stripHtml,
    stripSignatureAndQuotes,
    parseFromHeader,
    unwrapBody,
    looksLikeMetaWhatsapp,
  };
}
