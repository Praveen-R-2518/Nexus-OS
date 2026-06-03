import type { BillingCycle, PlanTier } from "@/components/signup/types";

export type PricingPlanSlug = "starter" | "professional" | "enterprise";

export type PricingTier = {
  slug: PricingPlanSlug;
  dbTier: PlanTier;
  title: string;
  monthlyPrice: number | null;
  annualMonthlyPrice: number | null;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  badge?: string;
  highlighted?: boolean;
  selectable: boolean;
};

export const PRICING_FAQ = [
  {
    question: "How long does setup take?",
    answer:
      "Most teams are live within 24 hours. We provide pre-built workflows for WhatsApp, Gmail, and Instagram DMs.",
  },
  {
    question: "What channels do you support?",
    answer: "WhatsApp, Gmail, and Instagram DMs. More channels coming soon.",
  },
  {
    question: "How is my data protected?",
    answer:
      "All data is encrypted in transit and at rest. Each organization's data is fully isolated using row-level security.",
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. Monthly plans cancel at end of billing period. No penalties.",
  },
  {
    question: "What happens when I hit my message limit?",
    answer:
      "We notify you at 80% usage. You can upgrade your plan or purchase additional message blocks at $20 per 1,000 messages.",
  },
] as const;

export const PRICING_TIERS: PricingTier[] = [
  {
    slug: "starter",
    dbTier: "starter",
    title: "Starter",
    monthlyPrice: 99,
    annualMonthlyPrice: 74,
    features: [
      "1 organization member",
      "2 channels (WhatsApp + Email)",
      "Basic AI classification",
      "Manual approval workflow",
      "Up to 500 messages/month",
      "Community support",
    ],
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup?plan=starter",
    badge: "No credit card required",
    selectable: true,
  },
  {
    slug: "professional",
    dbTier: "pro",
    title: "Professional",
    monthlyPrice: 299,
    annualMonthlyPrice: 224,
    features: [
      "5 team members",
      "All 3 channels (WhatsApp + Email + Instagram DMs)",
      "Advanced AI classification + risk detection",
      "Approval workflow + automation",
      "Up to 5,000 messages/month",
      "API access + email support",
      "Custom AI prompt training",
    ],
    ctaLabel: "Get Started",
    ctaHref: "/signup?plan=professional",
    badge: "Most Popular",
    highlighted: true,
    selectable: true,
  },
  {
    slug: "enterprise",
    dbTier: "enterprise",
    title: "Enterprise",
    monthlyPrice: null,
    annualMonthlyPrice: null,
    features: [
      "Unlimited team members",
      "Unlimited channels",
      "Priority API access",
      "Dedicated Slack support",
      "Custom integration setup",
      "SLA guarantees",
      "Annual contracts (20–30% discount)",
    ],
    ctaLabel: "Contact Sales",
    ctaHref: "mailto:support@example.com",
    selectable: false,
  },
];

export const STARTER_TRIAL_INCLUDES = [
  "1 organization member",
  "WhatsApp + Email channels",
  "Basic AI classification",
  "Manual approval workflow",
  "Up to 500 messages/month",
  "14-day free trial — no credit card",
];

export function parsePlanFromUrl(param: string | null): PlanTier {
  if (param === "professional" || param === "pro") return "pro";
  if (param === "enterprise") return "enterprise";
  return "starter";
}

export function planTierToSlug(tier: PlanTier | null): PricingPlanSlug {
  if (tier === "pro") return "professional";
  if (tier === "enterprise") return "enterprise";
  return "starter";
}

export function formatPrice(amount: number, cycle: BillingCycle): string {
  if (cycle === "annual") {
    return `$${amount}/mo`;
  }
  return `$${amount}/month`;
}

export function priceForTier(
  tier: PricingTier,
  cycle: BillingCycle,
): { display: string; compareAt?: string } {
  if (tier.monthlyPrice === null) {
    return { display: "Custom pricing" };
  }
  if (cycle === "annual" && tier.annualMonthlyPrice !== null) {
    return {
      display: `$${tier.annualMonthlyPrice}/mo`,
      compareAt: `$${tier.monthlyPrice}/mo`,
    };
  }
  return { display: `$${tier.monthlyPrice}/month` };
}
