"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  GitBranch,
  Lightbulb,
  LifeBuoy,
  Newspaper,
  Plus,
  Video,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FinalCta } from "@/components/landing/FinalCta";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { LiftButton } from "@/components/landing/primitives/LiftButton";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { TracedCard } from "@/components/landing/primitives/TracedCard";
import { DURATION, EASE } from "@/lib/landing/motion";

type Resource = {
  title: string;
  desc: string;
  meta: string;
  href: string;
};

type ResourceGroup = {
  id: string;
  title: string;
  icon: LucideIcon;
  items: Resource[];
};

const groups: ResourceGroup[] = [
  {
    id: "playbooks",
    title: "Playbooks & Guides",
    icon: Lightbulb,
    items: [
      {
        title: "The Revenue Rescue Playbook",
        desc: "A step-by-step framework for intercepting at-risk deals before they slip.",
        meta: "Guide · 12 min",
        href: "/docs#concepts",
      },
      {
        title: "Setting up your Command Center",
        desc: "Configure metrics, alerts, and queues so your team sees what matters first.",
        meta: "Guide · 8 min",
        href: "/docs#core-modules",
      },
      {
        title: "Writing AI drafts in your brand voice",
        desc: "Tune approvals so every reply sounds like you, not a robot.",
        meta: "Guide · 6 min",
        href: "/docs#concepts",
      },
    ],
  },
  {
    id: "blog",
    title: "From the Blog",
    icon: Newspaper,
    items: [
      {
        title: "Why response time is the new conversion rate",
        desc: "The data behind speed-to-lead and how automation closes the gap.",
        meta: "Article",
        href: "/customers",
      },
      {
        title: "Reading churn signals before they cost you",
        desc: "The subtle cues that predict cancellation, and how to act on them.",
        meta: "Article",
        href: "/customers",
      },
      {
        title: "Building an operating system for revenue",
        desc: "How modern founders unify inbox, approvals, and reporting in one console.",
        meta: "Article",
        href: "/",
      },
    ],
  },
  {
    id: "webinars",
    title: "Webinars & Demos",
    icon: Video,
    items: [
      {
        title: "Live product tour",
        desc: "A 20-minute walkthrough of the full Nexus OS console, end to end.",
        meta: "On-demand",
        href: "/signup",
      },
      {
        title: "Onboarding workshop",
        desc: "Connect your inbox and ship your first approved draft alongside our team.",
        meta: "Weekly",
        href: "/signup",
      },
    ],
  },
];

const changelog = [
  {
    version: "v1.4",
    date: "May 2026",
    note: "Buy-Back Report now exports to CSV and supports sortable columns.",
  },
  {
    version: "v1.3",
    date: "Apr 2026",
    note: "Added churn-risk scoring to the Command Center with live polling.",
  },
  {
    version: "v1.2",
    date: "Mar 2026",
    note: "Approval Queue gained one-click optimistic approve and reject.",
  },
  {
    version: "v1.1",
    date: "Feb 2026",
    note: "Encrypted Gmail / IMAP credential storage and inbox ingest.",
  },
];

const faqs = [
  {
    q: "What does Nexus OS actually do?",
    a: "It monitors your revenue channels, classifies every conversation by intent and urgency, surfaces at-risk revenue and churn signals, and drafts context-aware replies your team approves in one click.",
  },
  {
    q: "How is my data secured?",
    a: "Data is team-scoped in Supabase with row-level access, and inbox credentials are encrypted at rest with AES-256. Your workspace data is never shared across tenants.",
  },
  {
    q: "Which inboxes can I connect?",
    a: "Any Gmail or IMAP-compatible mailbox. You connect it during onboarding, and Nexus OS begins ingesting conversations into your Inbox tab.",
  },
  {
    q: "Do AI replies send automatically?",
    a: "No. Every draft lands in the Approval Queue. A human reviews, edits, and approves before anything is sent. You stay in control of your brand voice.",
  },
  {
    q: "How do I get started and what does it cost?",
    a: "Create a workspace from the signup wizard and pick a plan. See current pricing on the pricing page.",
  },
];

export default function ResourcesPage() {
  const reduce = useReducedMotion();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="flex-1 bg-white text-[#1d1d1f]">
      <Section tone="page" width="wide">
        <Reveal>
          <Eyebrow>Resources</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text="Learn, build, and ship faster"
          className="landing-section-headline mt-5 max-w-[640px] text-balance"
        />
        <Reveal delay={0.08}>
          <p className="mt-5 max-w-[560px] text-[17px] leading-[1.55] text-[#6e6e73]">
            Playbooks, articles, demos, and release notes to help you get the
            most out of Nexus OS.
          </p>
        </Reveal>
      </Section>

      {groups.map((group, gi) => {
        const Icon = group.icon;
        return (
          <Section
            key={group.id}
            tone={gi % 2 === 0 ? "alt" : "page"}
            rule
            width="wide"
          >
            <Reveal>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h2 className="landing-section-headline text-[clamp(1.5rem,2.5vw,2rem)]">
                  {group.title}
                </h2>
              </div>
            </Reveal>

            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item, i) => (
                <Reveal key={item.title} delay={i * 0.05} className="h-full">
                  <Link href={item.href} className="block h-full">
                    <TracedCard className="flex h-full flex-col p-6 transition-transform">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#86868b]">
                          {item.meta}
                        </span>
                        <ArrowUpRight
                          className="h-4 w-4 text-[#86868b]"
                          aria-hidden
                        />
                      </div>
                      <h3 className="mt-4 text-[17px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                        {item.title}
                      </h3>
                      <p className="mt-2 flex-1 text-[14px] leading-[1.55] text-[#6e6e73]">
                        {item.desc}
                      </p>
                    </TracedCard>
                  </Link>
                </Reveal>
              ))}
            </div>
          </Section>
        );
      })}

      <Section tone="alt" rule width="wide">
        <Reveal>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]">
              <GitBranch className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="landing-section-headline text-[clamp(1.5rem,2.5vw,2rem)]">
              Changelog
            </h2>
          </div>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="mt-8 overflow-hidden rounded-2xl border border-[color:var(--apple-hairline)] bg-white">
            {changelog.map((entry) => (
              <div
                key={entry.version}
                className="flex flex-col gap-2 border-b border-[color:var(--apple-hairline)] px-6 py-5 last:border-b-0 sm:flex-row sm:items-center sm:gap-6"
              >
                <div className="flex shrink-0 items-baseline gap-3 sm:w-40">
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-[#1d1d1f]">
                    {entry.version}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#86868b]">
                    {entry.date}
                  </span>
                </div>
                <p className="text-[14px] leading-[1.55] text-[#6e6e73]">
                  {entry.note}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </Section>

      <Section tone="page" rule width="wide" id="faq">
        <Reveal>
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]">
              <LifeBuoy className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="landing-section-headline text-[clamp(1.5rem,2.5vw,2rem)]">
              Frequently asked
            </h2>
          </div>
        </Reveal>
        <div className="mt-8 border-t border-[color:var(--apple-hairline)]">
          {faqs.map((faq, i) => {
            const isOpen = openFaq === i;
            return (
              <div
                key={faq.q}
                className="border-b border-[color:var(--apple-hairline)]"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="group flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)]"
                >
                  <span className="text-[16px] font-medium text-[#1d1d1f]">
                    {faq.q}
                  </span>
                  <motion.span
                    className="shrink-0 text-[#86868b]"
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ duration: DURATION.micro, ease: EASE }}
                    aria-hidden
                  >
                    <Plus className="h-4 w-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      className="overflow-hidden"
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={reduce ? undefined : { height: 0, opacity: 0 }}
                      transition={{ duration: DURATION.short, ease: EASE }}
                    >
                      <p className="max-w-[58ch] pb-6 pr-10 text-[15px] leading-[1.6] text-[#6e6e73]">
                        {faq.a}
                      </p>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </Section>

      <Section tone="alt" rule width="wide">
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-[color:var(--apple-hairline)] bg-white p-8 landing-elev-1 md:flex-row md:items-center md:p-10">
            <div>
              <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                Still have questions?
              </h2>
              <p className="mt-2 max-w-[480px] text-[15px] leading-[1.55] text-[#6e6e73]">
                Read the docs or talk to our team. We will help you map Nexus OS
                to your revenue motion.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <LiftButton href="/docs">Read the docs</LiftButton>
              <LiftButton href="mailto:support@example.com" variant="secondary">
                Contact support
              </LiftButton>
            </div>
          </div>
        </Reveal>
      </Section>

      <FinalCta />
    </div>
  );
}
