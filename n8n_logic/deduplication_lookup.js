/**
 * Nexus OS — Lead deduplication (Supabase REST + n8n Code)
 *
 * Looks up an **active** lead whose `customer_email` column matches the incoming
 * identity (plain email or `tel:+…` phone — same TEXT column per Nexus schema).
 *
 * ### n8n graph placement
 *
 * ```text
 * [Multi-Channel Normalizer] -> [Code: DedupLookupQuery] (Paste A) -> [HTTP Request: GET Supabase]
 *         ↓
 * [Code: Dedup Decision] (Paste B) -> [Switch on action]
 * ```
 *
 * ### HTTP Request node (Supabase)
 *
 * - Method: **GET**
 * - URL: `{{ $env.SUPABASE_URL }}/rest/v1/leads{{ $json.lookup_path }}`
 * - Authentication: **Generic Header** — `apikey: {{ $env.SUPABASE_ANON_KEY }}`
 * - Extra header: `Authorization: Bearer {{ $env.SUPABASE_ANON_KEY }}`
 * - Header: `Accept: application/json`
 *
 * The response body is a **JSON array** of rows (`[{ id, ... }]` or `[]`).
 *
 * ---
 *
 * ### Paste A — Code node `DedupLookupQuery` (run once, after Normalizer)
 *
 * ```javascript
 * const normalized = $input.first().json;
 * const id = normalized.customer_email_or_phone || '';
 * if (!id) throw new Error('DedupLookupQuery: missing customer_email_or_phone');
 * const variants = [...new Set([id, id.toLowerCase()].filter(Boolean))];
 * const orInner = variants.map((v) => `customer_email.eq.${encodeURIComponent(v)}`).join(',');
 * const lookup_path =
 *   '?select=id,status,updated_at' +
 *   '&status=in.(new,in_progress,awaiting_reply)' +
 *   '&or=(' + orInner + ')' +
 *   '&order=updated_at.desc&limit=1';
 * return [{ json: { lookup_path, normalized } }];
 * ```
 *
 * ### Paste B — Code node `Dedup Decision` (run once, **after** HTTP GET)
 *
 * ```javascript
 * const rows = $input.first().json;
 * const normalized = $('Multi-Channel Normalizer').first().json;
 * const hit = Array.isArray(rows) && rows[0] && rows[0].id;
 * if (hit) {
 *   return [{ json: { action: 'append_conversation', lead_id: rows[0].id, normalized } }];
 * }
 * return [{ json: { action: 'create_new_lead', normalized } }];
 * ```
 *
 * @see {@link ./multi_channel_normalizer.js}
 */

/**
 * Builds the query string for `/rest/v1/leads` (starts with `?`).
 *
 * @param {object} normalized - Output item from Multi-Channel Normalizer
 * @returns {string}
 */
function buildLookupPath(normalized) {
  const id = (normalized && normalized.customer_email_or_phone) || "";
  if (!id) throw new Error("deduplication_lookup: missing customer_email_or_phone");

  const variants = [...new Set([id, id.toLowerCase()].filter(Boolean))];
  const orInner = variants
    .map((v) => `customer_email.eq.${encodeURIComponent(v)}`)
    .join(",");

  return (
    "?select=id,status,updated_at" +
    "&status=in.(new,in_progress,awaiting_reply)" +
    "&or=(" +
    orInner +
    ")" +
    "&order=updated_at.desc&limit=1"
  );
}

/**
 * @param {string} supabaseProjectUrl - e.g. `https://xyzcompany.supabase.co`
 * @param {object} normalized
 * @returns {string} Full REST URL
 */
function buildLookupUrl(supabaseProjectUrl, normalized) {
  const base = String(supabaseProjectUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("deduplication_lookup: missing supabaseProjectUrl");
  return `${base}/rest/v1/leads${buildLookupPath(normalized)}`;
}

/**
 * @param {Array<object>} supabaseRows - Parsed JSON array from Supabase GET
 * @param {object} normalized
 * @returns {{ action: 'append_conversation'|'create_new_lead', lead_id?: string, normalized: object }}
 */
function decide(supabaseRows, normalized) {
  const rows = Array.isArray(supabaseRows) ? supabaseRows : [];
  if (rows.length > 0 && rows[0] && rows[0].id) {
    return {
      action: "append_conversation",
      lead_id: rows[0].id,
      normalized,
    };
  }
  return {
    action: "create_new_lead",
    normalized,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildLookupPath,
    buildLookupUrl,
    decide,
  };
}
