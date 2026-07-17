/**
 * Feature flags (Task C) — default OFF. These gate UNFINISHED/beta surfaces (Meta unified inbox,
 * social publishing) so they don't ship to every tenant by default. Routes stay alive either way
 * (deep links, API contracts, and n8n workflows keep working) — these flags only hide nav entries
 * and connect/compose affordances in the UI. `NEXT_PUBLIC_*` so both server and client components
 * can read them without extra plumbing.
 */

export function isMetaInboxEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_META_INBOX === "true";
}

export function isSocialPublishingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_SOCIAL_PUBLISHING === "true";
}

/** Billing/payment UI is unfinished (Task E.6) — hidden unless explicitly turned on. */
export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_BILLING === "true";
}
