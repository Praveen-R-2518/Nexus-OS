/**
 * Nexus OS — Multi-Channel Normalizer (n8n Code node)
 *
 * Collapses Gmail (IMAP / API-shaped), WhatsApp Cloud API webhooks, and Twilio
 * WhatsApp Sandbox payloads into one canonical object for WF2 Classification.
 *
 * ### n8n graph (WF0a Gmail / WF0b WhatsApp)
 *
 * ```text
 * [Trigger] -> [Multi-Channel Normalizer (Code)] -> [Noise Filter (Code)] -> [IF keep?]
 *   false -> [HTTP: POST workflow_logs] -> END
 *   true  -> [HTTP: GET leads dedup] -> [Dedup Decision (Code)] -> [Switch action]
 *             append -> [HTTP: POST conversations] -> [HTTP: PATCH leads] -> [Execute WF2]
 *             create -> [HTTP: POST conversations] -> [Execute WF2] -> [HTTP: log success]
 * ```
 *
 * ### Paste into n8n
 *
 * **Option A — import workflow:** run `npm run n8n:export-workflows` and import
 * `n8n_logic/exports/wf0a_gmail_intake.json` / `wf0b_whatsapp_intake.json` (Code
 * nodes already contain this logic).
 *
 * **Option B — manual Code node:** copy this file from the first `function stripHtml`
 * through the final `return $input.all().map(...)` (omit any `module.exports` block).
 *
 * @see {@link ./noise_filter.js}
 * @see {@link ./deduplication_lookup.js}
 */

// --- Shared helpers (safe in Node + n8n) ---

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSignatureAndQuotes(text) {
  if (!text || typeof text !== "string") return "";
  let t = text.replace(/\r\n/g, "\n");

  // Drop "On … wrote:" style quoted history
  const onWrote = /^On .+ wrote:\s*$/im;
  const idx = t.search(onWrote);
  if (idx !== -1) t = t.slice(0, idx).trim();

  // Trim after common signature delimiters
  const sigDash = t.split(/^--\s*$/m);
  if (sigDash.length > 1) t = sigDash[0].trim();

  const sentFrom = t.split(/^Sent from my .+$/im);
  if (sentFrom.length > 1) t = sentFrom[0].trim();

  return t.trim();
}

function parseFromHeader(from) {
  if (!from || typeof from !== "string") {
    return { customer_name: "", customer_email_or_phone: "" };
  }
  const trimmed = from.trim();
  const angled = /^\s*"?([^"<]*?)"?\s*<\s*([^>]+)\s*>\s*$/;
  const m = trimmed.match(angled);
  if (m) {
    const name = (m[1] || "").replace(/^"|"$/g, "").trim();
    const addr = (m[2] || "").trim();
    return {
      customer_name: name || titleCaseFromEmail(addr),
      customer_email_or_phone: addr.toLowerCase(),
    };
  }
  const bareEmail = trimmed.match(/^([\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,})$/);
  if (bareEmail) {
    const e = bareEmail[1].toLowerCase();
    return { customer_name: titleCaseFromEmail(e), customer_email_or_phone: e };
  }
  return { customer_name: trimmed, customer_email_or_phone: "" };
}

function titleCaseFromEmail(email) {
  const local = (email || "").split("@")[0] || "";
  if (!local) return "";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Normalize phone digits to tel:+E164-style string for Supabase `customer_email` co-use */
function toTelIdentity(phoneLike) {
  if (!phoneLike) return "";
  const s = String(phoneLike).trim();
  if (s.toLowerCase().startsWith("tel:")) return s;
  const whatsappPrefix = s.match(/^whatsapp:\+?(\d+)$/i);
  if (whatsappPrefix) return `tel:+${whatsappPrefix[1]}`;
  const digits = s.replace(/\D/g, "");
  if (!digits) return "";
  return `tel:+${digits}`;
}

function unwrapBody(payload) {
  if (payload && typeof payload === "object" && payload.body) return payload.body;
  return payload;
}

function getHeadersObject(raw) {
  const h = raw.headers;
  if (h && typeof h === "object" && !Array.isArray(h)) return h;
  if (typeof raw.headers === "string") return parseRawHeaders(raw.headers);
  // IMAP: sometimes header lines as array
  if (Array.isArray(raw.headerLines)) {
    const o = {};
    for (const line of raw.headerLines) {
      const idx = String(line).indexOf(":");
      if (idx > 0) {
        const k = String(line).slice(0, idx).trim().toLowerCase();
        o[k] = String(line).slice(idx + 1).trim();
      }
    }
    return o;
  }
  return {};
}

function parseRawHeaders(block) {
  const o = {};
  if (!block || typeof block !== "string") return o;
  const lines = block.split(/\r?\n/);
  let cur = null;
  for (const line of lines) {
    if (/^\s/.test(line) && cur) {
      o[cur] += " " + line.trim();
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    cur = line.slice(0, idx).trim().toLowerCase();
    o[cur] = line.slice(idx + 1).trim();
  }
  return o;
}

function gmailThreadKey(raw, headers) {
  if (raw.threadId) return String(raw.threadId);
  const inReply = headers["in-reply-to"] || headers["in_reply_to"];
  if (inReply) return `msg:${stripAngleId(inReply)}`;
  const msgId = headers["message-id"] || headers["message_id"];
  if (msgId) return `msg:${stripAngleId(msgId)}`;
  return null;
}

function stripAngleId(v) {
  return String(v).replace(/[<>]/g, "").trim();
}

function detectSource(raw) {
  const r = unwrapBody(raw);
  if (r && r.__source) return String(r.__source).toLowerCase();
  if (r && r.source && ["gmail", "whatsapp"].includes(String(r.source).toLowerCase())) {
    return String(r.source).toLowerCase();
  }
  // Twilio webhook
  if (r && (r.From || r.from) && (r.Body || r.body) && (r.SmsSid || r.MessageSid || r.AccountSid)) {
    return "whatsapp";
  }
  // Meta Cloud API
  if (r && r.entry && Array.isArray(r.entry) && r.entry[0] && r.entry[0].changes) {
    return "whatsapp";
  }
  // Gmail-ish
  if (r && (r.from || r.From) && (r.text !== undefined || r.html !== undefined || r.textHtml)) {
    return "gmail";
  }
  throw new Error(
    "multi_channel_normalizer: could not detect source; set __source to gmail|whatsapp",
  );
}

function parseGmail(rawInput) {
  const raw = unwrapBody(rawInput);
  const headers = getHeadersObject(raw);
  const fromField = raw.from || raw.From || headers.from || "";
  const { customer_name, customer_email_or_phone } = parseFromHeader(fromField);

  let body =
    (typeof raw.text === "string" && raw.text) ||
    (typeof raw.textPlain === "string" && raw.textPlain) ||
    (typeof raw.textAsHtml === "string" && stripHtml(raw.textAsHtml)) ||
    "";
  if (!body && typeof raw.html === "string") body = stripHtml(raw.html);
  if (!body && typeof raw.textHtml === "string") body = stripHtml(raw.textHtml);

  const message = stripSignatureAndQuotes(body);

  const subject = raw.subject || headers.subject || "";
  const receivedAt =
    raw.date ||
    raw.dateUtc ||
    raw.internalDate ||
    new Date().toISOString();

  const external_thread_id = gmailThreadKey(raw, headers);

  return {
    source: "gmail",
    customer_name,
    customer_email_or_phone,
    message,
    external_thread_id,
    received_at: typeof receivedAt === "number"
      ? new Date(receivedAt).toISOString()
      : new Date(receivedAt).toISOString(),
    raw_payload: rawInput,
    // Noise filter helpers
    _filter: {
      from_header: fromField,
      subject: subject || "",
      list_unsubscribe: !!(headers["list-unsubscribe"] || headers["list_unsubscribe"]),
      auto_submitted: headers["auto-submitted"] || headers["auto_submitted"] || "",
      has_attachment: !!(raw.attachments && raw.attachments.length),
      body_for_rules: message,
    },
  };
}

function parseWhatsApp(rawInput) {
  const raw = unwrapBody(rawInput);

  // --- Twilio WhatsApp Sandbox / API ---
  const fromTwilio = raw.From || raw.from;
  const bodyTwilio = raw.Body ?? raw.body;
  const profileName = raw.ProfileName || raw.profileName || "";

  if (fromTwilio && bodyTwilio !== undefined && bodyTwilio !== null) {
    const phone = toTelIdentity(fromTwilio);
    return {
      source: "whatsapp",
      customer_name: String(profileName || "").trim() || phone,
      customer_email_or_phone: phone,
      message: stripSignatureAndQuotes(String(bodyTwilio)),
      external_thread_id: phone.replace(/^tel:/, "wa:"),
      received_at: new Date().toISOString(),
      raw_payload: rawInput,
      _filter: {
        from_header: "",
        subject: "",
        list_unsubscribe: false,
        auto_submitted: "",
        has_attachment: !!(raw.NumMedia && Number(raw.NumMedia) > 0),
        body_for_rules: String(bodyTwilio),
      },
    };
  }

  // --- Meta WhatsApp Cloud API ---
  try {
    const entry0 = raw.entry[0];
    const change0 = entry0.changes[0];
    const value = change0.value;
    const msg0 = value.messages[0];
    const contact0 = value.contacts && value.contacts[0];
    const waFrom = msg0.from;
    const phone = toTelIdentity(waFrom);
    const textBody =
      msg0.text && msg0.text.body !== undefined
        ? msg0.text.body
        : msg0.type === "text"
          ? ""
          : `[${msg0.type}]`;

    return {
      source: "whatsapp",
      customer_name:
        (contact0 && contact0.profile && contact0.profile.name) || phone,
      customer_email_or_phone: phone,
      message: stripSignatureAndQuotes(String(textBody)),
      external_thread_id: phone.replace(/^tel:/, "wa:"),
      received_at: new Date().toISOString(),
      raw_payload: rawInput,
      _filter: {
        from_header: "",
        subject: "",
        list_unsubscribe: false,
        auto_submitted: "",
        has_attachment: msg0.type && msg0.type !== "text",
        body_for_rules: String(textBody),
      },
    };
  } catch (e) {
    throw new Error(
      `multi_channel_normalizer: WhatsApp parse failed — ${e.message}`,
    );
  }
}

function normalizeItem(raw) {
  const source =
    raw && raw.__source
      ? String(raw.__source).toLowerCase()
      : raw && raw.source && ["gmail", "whatsapp"].includes(String(raw.source).toLowerCase())
        ? String(raw.source).toLowerCase()
        : detectSource(raw);

  if (source === "gmail") return parseGmail(raw);
  if (source === "whatsapp") return parseWhatsApp(raw);
  throw new Error(`multi_channel_normalizer: unknown source "${source}"`);
}

// --- n8n entrypoint (paste from "if (typeof $input" through the closing brace into Code node) ---

if (typeof $input !== "undefined") {
  return $input.all().map(({ json }) => ({
    json: normalizeItem(json),
  }));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizeItem,
    detectSource,
    parseGmail,
    parseWhatsApp,
    stripHtml,
    stripSignatureAndQuotes,
    parseFromHeader,
    toTelIdentity,
  };
}
