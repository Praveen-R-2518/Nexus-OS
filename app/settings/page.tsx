import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/settings` is a legacy alias — `/profile` is the real settings destination (Task E.1). OAuth
 * callbacks (Gmail/Meta) and other callers may still link here with status query params (e.g.
 * `?connected=gmail`), so we forward them onto `/profile` instead of dropping them. `redirect()`
 * only ever sees the query string on the server — the URL hash (if any) is client-only and
 * cannot be preserved here; callers that need hash-based scrolling should target `/profile`
 * directly with a query param instead (see `app/profile/page.tsx`).
 */
export default function SettingsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) qs.append(key, v);
    } else {
      qs.append(key, value);
    }
  }
  const suffix = qs.toString();
  redirect(suffix ? `/profile?${suffix}` : "/profile");
}
