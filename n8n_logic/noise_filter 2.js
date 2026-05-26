/**
 * Nexus OS — Pre-classification noise filter (n8n Code node)
 *
 * Cheap string rules only — **no OpenAI**. Drops newsletters, auto-replies,
 * ultra-short pleasantries, and obvious spam before Dedup + WF2.
 *
 * **Input:** normalized JSON from {@link ./multi_channel_normalizer.js}
 * (`message`, `source`, `_filter`).
 *
 * ### n8n placement
 *
 * ```text
 * [Multi-Channel Normalizer] -> [Noise Filter (this file)] -> [IF: $json.keep]
 * ```
 *
 * Copy everything from `// --- n8n entrypoint ---` to the end into a Code node
 * (**Run Once for All Items**).
 */

// Regex end-of-string anchor is appended via String.fromCharCode(36) for n8n static analysis.
const AUTOMATED_LOCAL = new RegExp(
  "^(no-?reply|noreply|do-not-reply|mailer-daemon|notifications?|notify|alerts?|news(letters?)?|updates?|info|hello|support)(?:" +
    String.fromCharCode(36) +
    "|[.\\-_])",
  "i",
);

const PLEASANTRY = new RegExp(
  "^(thanks?|thx|ty|ok|okay|got\\s+it|cheers|noted|👍|🙏)\\b\\.?[!.']*" + String.fromCharCode(36),
  "iu",
);

const OFFICE_SUBJ = /^(out of office|automatic reply|vacation)\b/i;

const SPAM_LEX = [
  "free",
  "win",
  "click here",
  "prize",
  "viagra",
  "crypto",
  String.fromCharCode(36, 36, 36),
];

function tokenCount(s) {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function hasQuestion(body) {
  return typeof body === "string" && body.includes("?");
}

function normBody(message, filter) {
  const b = (filter && filter.body_for_rules) || message || "";
  return String(b).trim();
}

function drop(reason, normalized) {
  return {
    json: {
      keep: false,
      drop_reason: reason,
      normalized,
    },
  };
}

function keep(normalized) {
  return {
    json: {
      keep: true,
      drop_reason: null,
      ...normalized,
    },
  };
}

function evaluateNoiseFilter(normalized) {
  const f = normalized._filter || {};
  const body = normBody(normalized.message, f);
  const fromHeader = String(f.from_header || "").toLowerCase();
  const subject = String(f.subject || "");

  // Extract rough "local part" and domain for Gmail-ish heuristics
  const emailMatch = fromHeader.match(new RegExp("<([^>]+)>\\s*" + String.fromCharCode(36)));
  const addr = (emailMatch ? emailMatch[1] : fromHeader).trim();
  const at = addr.lastIndexOf("@");
  const localPart = at > 0 ? addr.slice(0, at) : addr;
  const domain = at > 0 ? addr.slice(at + 1) : "";

  if (normalized.source === "gmail") {
    if (
      (AUTOMATED_LOCAL.test(localPart) || AUTOMATED_LOCAL.test(domain)) &&
      !hasQuestion(body)
    ) {
      return drop("automated_sender_no_question", normalized);
    }

    if (OFFICE_SUBJ.test(subject)) {
      return drop("auto_reply_subject", normalized);
    }

    const autoSub = String(f.auto_submitted || "").toLowerCase();
    if (autoSub.includes("auto-replied")) {
      return drop("auto_submitted_header", normalized);
    }

    if (f.list_unsubscribe) {
      return drop("list_unsubscribe_header", normalized);
    }

    if (
      /\bunsubscribe\b/i.test(body) &&
      /\bhttps?:\/\//i.test(body.slice(0, 80))
    ) {
      return drop("newsletter_unsubscribe_body", normalized);
    }
  }

  const tokens = tokenCount(body);
  if (tokens <= 3 && tokens > 0 && PLEASANTRY.test(body)) {
    return drop("short_pleasantry", normalized);
  }

  if (body.length < 8 && !f.has_attachment) {
    return drop("body_too_short", normalized);
  }

  let spamHits = 0;
  const low = body.toLowerCase();
  for (const w of SPAM_LEX) {
    if (low.includes(w)) spamHits++;
  }
  if (spamHits >= 3) {
    return drop("spam_keyword_density", normalized);
  }

  return keep(normalized);
}

// --- n8n entrypoint ---
if (typeof $input !== "undefined") {
  try {
    return $input.all().map(({ json }) => evaluateNoiseFilter(json));
  } catch (error) {
    return [
      {
        json: {
          error: error.message,
          node: "NoiseFilter",
          timestamp: new Date().toISOString(),
        },
      },
    ];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    evaluateNoiseFilter,
  };
}
