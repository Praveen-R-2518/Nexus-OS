/**
 * Every string and data row on the landing page lives here.
 *
 * Rule: claims must be verifiable from the codebase or docs. No invented
 * customer outcomes, no fabricated revenue figures, no named customers.
 * Testimonials live in `./testimonials` and ship empty until real ones exist.
 */

export type NexusAccent =
  | "discovery"
  | "intake"
  | "rescue"
  | "approval"
  | "execution"
  | "growth";

/** Maps to the --nexus-* custom properties already defined in globals.css. */
export const ACCENT_VAR: Record<NexusAccent, string> = {
  discovery: "var(--nexus-discovery)",
  intake: "var(--nexus-intake)",
  rescue: "var(--nexus-rescue)",
  approval: "var(--nexus-approval)",
  execution: "var(--nexus-execution)",
  growth: "var(--nexus-growth)",
};

export const ACCENT_SOFT: Record<NexusAccent, string> = {
  discovery: "var(--nexus-discovery-soft)",
  intake: "var(--nexus-intake-soft)",
  rescue: "var(--nexus-rescue-soft)",
  approval: "var(--nexus-approval-soft)",
  execution: "var(--nexus-execution-soft)",
  growth: "var(--nexus-growth-soft)",
};

/* ------------------------------------------------------------------ hero */

export const HERO = {
  eyebrow: "Revenue Command Center",
  headline: "Every message triaged. Every reply drafted. Nothing sent without you.",
  /** Rendered as one <h1>; split here only to control the line accent. */
  subhead:
    "Nexus OS reads every inbound customer message across Gmail, WhatsApp and Instagram, filters the noise, scores what it is worth, and writes the reply. You stay the last step.",
  primaryCta: { label: "Start free trial", href: "/signup" },
  secondaryCta: { label: "See how it works", href: "#protocol" },
  microcopy: "14-day trial · No credit card · Live in under a day",
} as const;

/* -------------------------------------------------------------- channels */

/** Real integrations only — these all exist in the repo. */
export const CHANNELS = [
  { name: "Gmail", note: "OAuth + IMAP intake" },
  { name: "WhatsApp", note: "Meta Cloud API" },
  { name: "Instagram", note: "Direct messages" },
  { name: "Messenger", note: "Facebook Pages" },
  { name: "IMAP / SMTP", note: "Any other mailbox" },
  { name: "Supabase", note: "Your own Postgres" },
  { name: "n8n", note: "Workflow runtime" },
  { name: "OpenAI", note: "Classification + drafting" },
] as const;

export const MARQUEE = {
  eyebrow: "Connected",
  title: "Plugs into the channels your customers already use.",
} as const;

/* ---------------------------------------------------------------- stakes */

export const STAKES = {
  eyebrow: "The problem",
  title: "Revenue does not arrive in a CRM. It arrives as a message you have not read yet.",
  body:
    "A billing dispute in Gmail, an upgrade question in a DM, a churn signal buried under sixty newsletters. The deal is not lost because you said no — it is lost because nobody answered in time.",
  /** Capability figures, not customer outcomes. Each is true of the system. */
  stats: [
    {
      value: 3,
      suffix: "",
      label: "live channels",
      note: "Gmail, WhatsApp and Instagram — the ones your customers already use",
    },
    {
      value: 6,
      suffix: "",
      label: "step protocol",
      note: "Discovery through Growth, every message the same way",
    },
    {
      value: 0,
      suffix: "",
      label: "sent unapproved",
      note: "Every outbound reply is gated by policy — nothing bypasses you",
    },
  ],
} as const;

/* ------------------------------------------------------------ product tour */

export type TourStop = {
  id: string;
  tab: string;
  title: string;
  body: string;
  accent: NexusAccent;
};

export const TOUR = {
  eyebrow: "The product",
  title: "One surface for everything customers send you.",
  stops: [
    {
      id: "inbox",
      tab: "Inbox",
      title: "Every channel, one queue",
      body: "Gmail, WhatsApp and Instagram normalise into a single message shape, deduplicated and sorted by what each conversation is worth.",
      accent: "intake",
    },
    {
      id: "approval",
      tab: "Approval",
      title: "You are the last step",
      body: "High-value and churn-risk replies stop here. Read the draft, edit a line, approve. Low-risk replies can auto-send once you set the policy.",
      accent: "approval",
    },
    {
      id: "report",
      tab: "Report",
      title: "The hours you got back",
      body: "See what was rescued, what was drafted for you, and where the queue is slowing down — without opening a spreadsheet.",
      accent: "growth",
    },
  ] satisfies TourStop[],
} as const;

/* -------------------------------------------------------------- protocol */

export type ProtocolStep = {
  id: string;
  index: string;
  title: string;
  accent: NexusAccent;
  body: string;
};

export const PROTOCOL = {
  eyebrow: "The protocol",
  title: "Six steps between an unread message and a closed loop.",
  steps: [
    {
      id: "discovery",
      index: "01",
      title: "Discovery",
      accent: "discovery",
      body: "Nexus watches your connected inboxes continuously. New messages arrive through OAuth and webhooks, not a nightly export, so nothing waits in a queue you forgot about.",
    },
    {
      id: "intake",
      index: "02",
      title: "Intake",
      accent: "intake",
      body: "A zero-cost filter drops spam, receipts and newsletters before any paid model runs. What survives is normalised into one shape, whatever channel it came from.",
    },
    {
      id: "rescue",
      index: "03",
      title: "Rescue",
      accent: "rescue",
      body: "Each surviving message is classified for intent, urgency, estimated value and churn risk — so an angry enterprise customer never sits below a cold pitch.",
    },
    {
      id: "approval",
      index: "04",
      title: "Approval",
      accent: "approval",
      body: "A reply is drafted in your voice using your own business context. Anything high-value or high-risk lands in your approval queue. You edit or approve in one click.",
    },
    {
      id: "execution",
      index: "05",
      title: "Execution",
      accent: "execution",
      body: "Approved replies go back out on the channel they arrived on. Every send is logged, idempotent and attributable, so the same message never goes twice.",
    },
    {
      id: "growth",
      index: "06",
      title: "Growth",
      accent: "growth",
      body: "The buy-back report closes the loop: what was rescued, what was drafted, and how much of your week the queue handed back to you.",
    },
  ] satisfies ProtocolStep[],
} as const;

/* -------------------------------------------------------------- features */

export type FeatureCard = {
  id: string;
  title: string;
  body: string;
  accent: NexusAccent;
  /** "wide" cells span two columns on desktop. */
  size: "wide" | "small";
};

export const FEATURES = {
  eyebrow: "Capabilities",
  title: "Built as plain steps, not a black box.",
  body: "Fetch, filter, classify, draft and send are deterministic. The only agent in the system is the read-only one you talk to.",
  cards: [
    {
      id: "filter",
      title: "Noise filter that costs nothing",
      body: "Spam, receipts, calendar invites and newsletters are dropped by rules before a single token is spent. Your AI bill tracks real customers, not mailing lists.",
      accent: "intake",
      size: "wide",
    },
    {
      id: "classify",
      title: "Value-aware triage",
      body: "Intent, urgency, estimated value and churn risk on every message.",
      accent: "rescue",
      size: "small",
    },
    {
      id: "draft",
      title: "Replies in your voice",
      body: "Drafts are grounded in your own docs and past conversations — retrieval, not a fine-tune.",
      accent: "discovery",
      size: "small",
    },
    {
      id: "queue",
      title: "An approval queue you actually clear",
      body: "One screen, one decision per message. Approve, edit, or reject — and the policy learns where you want the line drawn between auto-send and hard gate.",
      accent: "approval",
      size: "wide",
    },
    {
      id: "inbox",
      title: "Unified inbox",
      body: "Every channel normalised to one message shape, deduplicated on arrival.",
      accent: "execution",
      size: "small",
    },
    {
      id: "report",
      title: "Buy-back report",
      body: "What the system rescued and drafted, summarised on a schedule you set.",
      accent: "growth",
      size: "small",
    },
  ] satisfies FeatureCard[],
} as const;

/* ----------------------------------------------------------------- trust */

export const TRUST = {
  eyebrow: "Architecture",
  title: "The boring guarantees, in writing.",
  body: "These are properties of the system, not policy promises.",
  items: [
    {
      id: "rls",
      title: "Row-level tenant isolation",
      body: "Every row carries a tenant id and every table enables row-level security from the day it is created. One customer cannot read another's data.",
    },
    {
      id: "encryption",
      title: "Encrypted third-party tokens",
      body: "Gmail and Meta credentials are AES-256 encrypted before they are stored. Service keys are server-only and never reach the browser bundle.",
    },
    {
      id: "gate",
      title: "Nothing sends itself",
      body: "Classifiers and drafters cannot send. Every outbound reply passes through the approval layer, where policy decides auto-send or a hard gate.",
    },
    {
      id: "webhooks",
      title: "Verified webhooks",
      body: "Inbound webhook payloads are signature-checked before they are trusted, and message ingestion is idempotent, so a replay cannot double-send.",
    },
    {
      id: "vector",
      title: "Your data stays in your database",
      body: "Embeddings live in pgvector inside the same Postgres as everything else. There is no separate vector service holding a copy of your conversations.",
    },
    {
      id: "nofinetune",
      title: "No fine-tuning on your data",
      body: "Quality comes from prompts, examples and retrieval over your own documents. Your customer messages are not training data.",
    },
  ],
} as const;

/* ---------------------------------------------------------- integrations */

export const INTEGRATIONS = {
  eyebrow: "How it fits",
  title: "Sits between your inbox and your team. Nothing to rip out.",
  body:
    "Connect a mailbox with OAuth, point your Meta pages at the webhook, and Nexus does the rest. Workflows run in n8n, data lands in Supabase, and you keep both.",
  lanes: [
    { id: "in", label: "Inbound", nodes: ["Gmail", "WhatsApp", "Instagram", "Messenger"] },
    { id: "core", label: "Nexus OS", nodes: ["Filter", "Classify", "Draft", "Approve"] },
    { id: "out", label: "Your stack", nodes: ["Supabase", "n8n", "Reports"] },
  ],
} as const;

/* ------------------------------------------------------------- pricing */

export const PRICING = {
  eyebrow: "Pricing",
  title: "Three plans. No usage surprises.",
  body: "Start on a 14-day trial. Move up when your message volume does, not before.",
  footnote:
    "We notify you at 80% of your monthly message limit. Extra blocks are $20 per 1,000 messages.",
} as const;

export const FAQ_SECTION = {
  eyebrow: "Questions",
  title: "Before you start.",
} as const;

/* ---------------------------------------------------------- testimonials */

export const TESTIMONIAL_SECTION = {
  eyebrow: "Customers",
  title: "What teams say after the first week.",
} as const;

/* ------------------------------------------------------------ final cta */

export const FINAL_CTA = {
  title: "Your next customer already messaged you.",
  body: "Connect one inbox and see what the last thirty days were hiding.",
  primaryCta: { label: "Start free trial", href: "/signup" },
  secondaryCta: { label: "Talk to us", href: "mailto:support@example.com" },
  microcopy: "No credit card required · Cancel any time",
} as const;
