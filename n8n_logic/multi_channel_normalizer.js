/**
 * Nexus OS - Gmail and API intake normalizer (n8n Code node)
 *
 * Converts Gmail/IMAP trigger payloads and generic JSON ingest bodies
 * into the canonical object consumed by the noise filter and WF2.
 */

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
  if (payload && typeof payload === "object" && payload.body) return payload.body;
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

const EXPLICIT_SOURCES = ["gmail", "webhook", "manual", "email", "imap"];

function detectSource(rawInput) {
  const raw = unwrapBody(rawInput) || {};
  const explicit = raw.__source || raw.source;
  if (explicit && EXPLICIT_SOURCES.includes(String(explicit).toLowerCase())) {
    return String(explicit).toLowerCase();
  }
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
  if (typeof raw.message === "string" && raw.message.trim()) {
    return "webhook";
  }
  throw new Error(
    "multi_channel_normalizer: expected a Gmail-style payload or JSON with a non-empty message field",
  );
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

function parseWebhookIngest(rawInput, source) {
  const raw = unwrapBody(rawInput) || {};
  const resolvedSource = ["webhook", "manual", "email", "imap"].includes(source)
    ? source
    : "webhook";
  return {
    source: resolvedSource,
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

function normalizeItem(raw) {
  const source = detectSource(raw);
  if (source === "gmail") return parseGmail(raw);
  return parseWebhookIngest(raw, source);
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
    parseWebhookIngest,
    stripHtml,
    stripSignatureAndQuotes,
    parseFromHeader,
  };
}
