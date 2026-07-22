/**
 * Left-panel copy for the chromeless auth split.
 * Product-truth only — no invented customer outcomes.
 */

export type AuthBrandCopy = {
  eyebrow: string;
  headline: string;
  points: readonly string[];
  footer: string;
};

export const LOGIN_BRAND: AuthBrandCopy = {
  eyebrow: "Revenue command center",
  headline: "Every message triaged. Nothing sent without you.",
  points: [
    "Gmail, WhatsApp and Instagram in one queue",
    "Six-step protocol from intake to buy-back",
    "Every outbound reply gated by your approval",
  ],
  footer: "Approval-gated · Tenant-isolated · Your inbox",
};

/** Index is signup currentStep (1–6). */
export const SIGNUP_BRAND_BY_STEP: Record<number, AuthBrandCopy> = {
  1: {
    eyebrow: "Create account",
    headline: "Start the workspace that watches your inbox.",
    points: [
      "One account, one tenant boundary from day one",
      "Email verification before anything connects",
      "You stay the last step on every reply",
    ],
    footer: "No credit card on account creation",
  },
  2: {
    eyebrow: "Workspace",
    headline: "Name the surface your team will run from.",
    points: [
      "Solo or team — same approval architecture",
      "Invites stay scoped to your organization",
      "Row-level security on every table",
    ],
    footer: "Your data never crosses tenants",
  },
  3: {
    eyebrow: "Plan",
    headline: "Pick the pace that matches your volume.",
    points: [
      "Starter for one operator, Pro for the desk",
      "Message limits you can see before you hit them",
      "Upgrade when the queue asks for it — not before",
    ],
    footer: "14-day trial on Starter",
  },
  4: {
    eyebrow: "Payment",
    headline: "Billing that matches the plan you chose.",
    points: [
      "Monthly or annual — same feature set",
      "Cancel at period end with no penalty",
      "Usage alerts before you run out",
    ],
    footer: "Transparent pricing · No hidden fees",
  },
  5: {
    eyebrow: "Connect inbox",
    headline: "Point Nexus at the channel customers already use.",
    points: [
      "Gmail OAuth — credentials encrypted at rest",
      "Skip now and finish later from Settings",
      "Nothing sends until you approve a draft",
    ],
    footer: "AES-256 tokens · Signature-verified webhooks",
  },
  6: {
    eyebrow: "Ready",
    headline: "Your command center is live.",
    points: [
      "Open the inbox and clear the first draft",
      "Tune approval policy when you are ready",
      "The buy-back report closes the loop",
    ],
    footer: "Nothing sent without you",
  },
};

export function signupBrandForStep(step: number): AuthBrandCopy {
  return SIGNUP_BRAND_BY_STEP[step] ?? SIGNUP_BRAND_BY_STEP[1];
}
