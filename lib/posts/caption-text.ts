/**
 * Pure caption helpers shared by the composer and the n8n publish path.
 * Keep this file free of `use client` so server routes can import it.
 */

/** Append hashtags that are not already present in the caption body. */
export function composeCaptionWithHashtags(
  caption: string,
  hashtags: string[] | undefined | null,
): string {
  const base = caption.trim();
  const tags = (hashtags ?? [])
    .filter((h): h is string => typeof h === "string")
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean);
  if (tags.length === 0) return base;

  const existing = new Set(
    (base.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1).toLowerCase()),
  );
  const missing = tags.filter((t) => !existing.has(t.toLowerCase()));
  if (missing.length === 0) return base;
  const extra = missing.map((t) => `#${t}`).join(" ");
  return base ? `${base}\n\n${extra}` : extra;
}

export function scheduledPostApprovalFields(nowIso = new Date().toISOString()): {
  approval_status: "approved";
  approved_at: string;
} {
  return { approval_status: "approved", approved_at: nowIso };
}
