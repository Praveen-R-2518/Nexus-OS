"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  GitBranch,
  Lightbulb,
  LifeBuoy,
  Newspaper,
  Video,
  type LucideIcon,
} from "lucide-react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

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
        desc: "The subtle cues that predict cancellation — and how to act on them.",
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
    a: "No. Every draft lands in the Approval Queue. A human reviews, edits, and approves before anything is sent — you stay in control of your brand voice.",
  },
  {
    q: "How do I get started and what does it cost?",
    a: "Create a workspace from the signup wizard and pick a plan. See current pricing on the signup flow.",
  },
];

export default function ResourcesPage() {
  return (
    <div className="flex flex-1 flex-col">
      <ScrollReveal className="hairline-b pb-12 pt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-ref-cta dark:text-muted">
          Resources
        </p>
        <h1 className="mt-3 max-w-3xl font-sans text-4xl font-black uppercase leading-[1.05] tracking-tighter text-atmospheric-grey sm:text-5xl md:text-6xl">
          Learn, build, and ship faster
        </h1>
        <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-muted">
          Playbooks, articles, demos, and release notes to help you get the most
          revenue out of Nexus OS.
        </p>
      </ScrollReveal>

      <div className="space-y-16 py-16">
        {groups.map((group) => {
          const Icon = group.icon;
          return (
            <ScrollReveal key={group.id}>
              <section>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-ref-cta dark:border-border dark:bg-surface-card dark:text-muted">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h2 className="font-sans text-2xl font-black uppercase tracking-tight text-atmospheric-grey md:text-3xl">
                    {group.title}
                  </h2>
                </div>

                <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="group flex h-full flex-col rounded-2xl border border-border bg-white p-6 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-white/15 dark:bg-[#161616] dark:hover:border-white/35 dark:hover:bg-[#1f1f1f]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
                          {item.meta}
                        </span>
                        <ArrowUpRight
                          className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-atmospheric-grey"
                          aria-hidden
                        />
                      </div>
                      <h3 className="mt-4 font-sans text-lg font-semibold tracking-tight text-atmospheric-grey">
                        {item.title}
                      </h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted dark:text-slate-300">
                        {item.desc}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            </ScrollReveal>
          );
        })}

        <ScrollReveal>
          <section>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-ref-cta dark:border-border dark:bg-surface-card dark:text-muted">
                <GitBranch className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="font-sans text-2xl font-black uppercase tracking-tight text-atmospheric-grey md:text-3xl">
                Changelog
              </h2>
            </div>
            <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-white dark:border-border dark:bg-surface-card">
              {changelog.map((entry) => (
                <div
                  key={entry.version}
                  className="flex flex-col gap-2 border-b border-border px-6 py-5 last:border-b-0 sm:flex-row sm:items-center sm:gap-6 dark:border-white/10"
                >
                  <div className="flex shrink-0 items-baseline gap-3 sm:w-40">
                    <span className="font-mono text-sm font-bold tabular-nums text-atmospheric-grey">
                      {entry.version}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                      {entry.date}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-muted dark:text-slate-300">
                    {entry.note}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </ScrollReveal>

        <ScrollReveal>
          <section>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-ref-cta dark:border-border dark:bg-surface-card dark:text-muted">
                <LifeBuoy className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="font-sans text-2xl font-black uppercase tracking-tight text-atmospheric-grey md:text-3xl">
                Frequently asked
              </h2>
            </div>
            <div className="mt-7 space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.q}
                  className="group rounded-2xl border border-border bg-white px-6 py-5 transition-colors hover:border-slate-300 dark:border-white/15 dark:bg-[#161616] dark:hover:border-white/35"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans text-base font-semibold tracking-tight text-atmospheric-grey">
                    {faq.q}
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                      aria-hidden
                    />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted dark:text-slate-300">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </ScrollReveal>
      </div>

      <ScrollReveal className="pb-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-border bg-[#f8fafc] p-10 dark:border-white/20 dark:bg-[#1c1c1c] md:flex-row md:items-center">
          <div>
            <h2 className="font-sans text-xl font-black uppercase tracking-tight text-atmospheric-grey">
              Still have questions?
            </h2>
            <p className="mt-2 max-w-xl font-mono text-sm leading-relaxed text-muted">
              Read the docs or talk to our team — we will help you map Nexus OS to
              your revenue motion.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-ref-cta px-5 py-2.5 font-mono text-[10px] font-medium uppercase tracking-widest text-[#f4f8fc] transition-opacity hover:opacity-90 dark:border-border dark:bg-ref-cta dark:text-[#f4f8fc]"
            >
              Read the docs
            </Link>
            <Link
              href="mailto:support@example.com"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-atmospheric-grey transition-colors hover:bg-ref-mint dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated"
            >
              Contact support
            </Link>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
