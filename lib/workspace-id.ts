/**
 * Parse a required workspace UUID from n8n / API JSON bodies.
 * Returns null if missing or not a canonical UUID v1–v5 string.
 */
export function parseWorkspaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s,
    )
  ) {
    return null;
  }
  return s;
}
