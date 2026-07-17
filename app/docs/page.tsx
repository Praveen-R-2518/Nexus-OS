"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Compass,
  Database,
  GraduationCap,
  Layers,
  Plug,
  Rocket,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

type DocLink = {
  title: string;
  desc: string;
  tag: string;
};

type DocSection = {
  id: string;
  eyebrow: string;
  title: string;
  intro: string;
  icon: LucideIcon;
  links: DocLink[];
};

const sections: DocSection[] = [
  {
    id: "getting-started",
    eyebrow: "01 · Start here",
    title: "Getting Started",
    intro:
      "Stand up your workspace and connect your first revenue channel in under ten minutes.",
    icon: Rocket,
    links: [
      {
        title: "Onboard your workspace",
        desc: "Create your team, invite operators, and bind your workspace to a plan from the signup wizard.",
        tag: "Setup",
      },
      {
        title: "Connect Gmail / IMAP",
        desc: "Securely link the inbox Nexus OS monitors. Credentials are encrypted at rest with AES-256.",
        tag: "Channels",
      },
      {
        title: "Invite your team",
        desc: "Add teammates so drafts, approvals, and revenue alerts route to the right operators.",
        tag: "Team",
      },
    ],
  },
  {
    id: "core-modules",
    eyebrow: "02 · The console",
    title: "Core Modules",
    intro:
      "Every authenticated tab in Nexus OS, and what it does for your revenue motion.",
    icon: Layers,
    links: [
      {
        title: "Command Center",
        desc: "Live operations dashboard: revenue at risk, hot leads, churn signals, and team throughput.",
        tag: "Dashboard",
      },
      {
        title: "Inbox",
        desc: "Triage incoming conversations with intent, urgency, and value scoring in a split-pane view.",
        tag: "Triage",
      },
      {
        title: "Approval Queue",
        desc: "Review, edit, and approve AI-drafted replies in one click while keeping your brand voice.",
        tag: "Drafts",
      },
      {
        title: "Buy-Back Report",
        desc: "Daily summary of revenue rescued and at-risk deals, with a sortable table and CSV export.",
        tag: "Reporting",
      },
    ],
  },
  {
    id: "concepts",
    eyebrow: "03 · How it thinks",
    title: "Core Concepts",
    intro:
      "The models and scoring that decide what your team sees first.",
    icon: Compass,
    links: [
      {
        title: "Lead classification & intent",
        desc: "How incoming messages are categorized by intent (purchase, support, churn) and scored.",
        tag: "AI",
      },
      {
        title: "Revenue-at-risk model",
        desc: "How estimated deal value and urgency combine into the prioritization you see on the dashboard.",
        tag: "Scoring",
      },
      {
        title: "Churn signal detection",
        desc: "The cues Nexus OS reads to surface customers showing churn risk before they leave.",
        tag: "Retention",
      },
      {
        title: "Draft & approval flow",
        desc: "From AI-generated draft to human-approved send: the lifecycle of every reply.",
        tag: "Workflow",
      },
    ],
  },
  {
    id: "integrations",
    eyebrow: "04 · Connect everything",
    title: "Integrations",
    intro:
      "Nexus OS sits on top of the tools you already run.",
    icon: Plug,
    links: [
      {
        title: "Supabase",
        desc: "Your team-scoped data store and auth backbone, powering every live metric in the console.",
        tag: "Data",
      },
      {
        title: "Gmail & IMAP",
        desc: "Ingest conversations from any IMAP-compatible mailbox with encrypted credential storage.",
        tag: "Email",
      },
      {
        title: "n8n workflows",
        desc: "Extend automation with internal n8n endpoints for ingest and workflow logging.",
        tag: "Automation",
      },
    ],
  },
];

const quickStart = [
  { step: "1", label: "Create workspace", href: "/signup" },
  { step: "2", label: "Connect inbox", href: "/signup" },
  { step: "3", label: "Approve first draft", href: "/login" },
];

export default function DocsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <ScrollReveal className="hairline-b pb-12 pt-4">
        <p className="nexus-meta text-nexus-discovery dark:text-nexus-discovery">
          Documentation
        </p>
        <h1 className="mt-3 max-w-3xl nexus-page-title text-atmospheric-grey dark:text-white">
          Everything you need to run Nexus OS
        </h1>
        <p className="mt-5 max-w-2xl nexus-body text-muted dark:text-slate-300">
          Guides, concepts, and integration references for the AI revenue-rescue
          engine. Pick a track below or jump straight into the console.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {quickStart.map(({ step, label, href }) => (
            <Link
              key={step}
              href={href}
              className="group inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-atmospheric-grey transition-colors hover:bg-nexus-discovery-soft dark:border-border dark:bg-surface-card dark:hover:bg-surface-elevated"
            >
              <span className="text-nexus-discovery dark:text-nexus-discovery">{step}</span>
              {label}
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      </ScrollReveal>

      <nav
        aria-label="Documentation sections"
        className="hairline-b flex flex-wrap gap-x-6 gap-y-2 py-5"
      >
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="text-sm font-medium text-muted transition-colors hover:text-atmospheric-grey dark:text-slate-300 dark:hover:text-white"
          >
            {section.title}
          </a>
        ))}
      </nav>

      <div className="space-y-20 py-16">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <ScrollReveal key={section.id} className="scroll-mt-28">
              <section id={section.id}>
                <div className="flex items-start gap-4">
                  <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-nexus-discovery-border bg-nexus-discovery-soft text-nexus-discovery dark:border-nexus-discovery-border dark:bg-nexus-discovery-soft dark:text-nexus-discovery">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="nexus-meta text-muted dark:text-slate-400">
                      {section.eyebrow}
                    </p>
                    <h2 className="mt-2 nexus-section-title text-atmospheric-grey dark:text-white">
                      {section.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted dark:text-slate-300">
                      {section.intro}
                    </p>
                  </div>
                </div>

                <div className="mx-auto mt-10 flex max-w-6xl flex-wrap justify-center gap-5">
                  {section.links.map((link, index) => (
                    <ScrollReveal
                      key={link.title}
                      delay={index * 0.06}
                      className="flex h-full w-full max-w-[22rem] flex-[1_1_22rem]"
                    >
                      <div className="group relative flex h-full min-h-[15rem] w-full overflow-hidden rounded-[1.75rem] border border-border bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:bg-slate-50 hover:shadow-card-halo-light dark:border-white/15 dark:bg-[#161616] dark:hover:border-white/35 dark:hover:bg-[#1f1f1f] dark:hover:shadow-none">
                        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-ref-cta/35 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 dark:via-white/35" />
                        <div className="flex flex-col">
                          <span className="inline-flex w-fit rounded-full border border-nexus-discovery-border bg-nexus-discovery-soft px-2.5 py-1 text-xs font-medium text-nexus-discovery dark:border-white/15 dark:bg-white/5 dark:text-white">
                            {link.tag}
                          </span>
                          <h3 className="mt-5 font-sans text-xl font-semibold leading-tight tracking-tight text-atmospheric-grey dark:text-white">
                            {link.title}
                          </h3>
                          <p className="mt-3 flex-1 text-sm leading-relaxed text-muted dark:text-slate-300">
                            {link.desc}
                          </p>
                        </div>
                      </div>
                    </ScrollReveal>
                  ))}
                </div>
              </section>
            </ScrollReveal>
          );
        })}
      </div>

      <ScrollReveal className="pb-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-border bg-[#f8fafc] p-10 dark:border-white/20 dark:bg-[#1c1c1c] md:flex-row md:items-center">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval dark:border-nexus-approval-border dark:bg-nexus-approval-soft dark:text-nexus-approval">
              <GraduationCap className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="nexus-section-title text-atmospheric-grey dark:text-white">
                Ready to put it to work?
              </h2>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-muted dark:text-slate-300">
                Spin up a workspace and approve your first AI-drafted reply today.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full border border-nexus-approval bg-nexus-approval px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:border-nexus-approval dark:bg-nexus-approval"
            >
              <Workflow className="h-3.5 w-3.5" aria-hidden />
              Get started
            </Link>
            <Link
              href="/resources"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-5 py-2.5 text-sm font-medium text-atmospheric-grey transition-colors hover:bg-nexus-discovery-soft dark:border-border dark:bg-surface-card dark:text-white dark:hover:bg-surface-elevated"
            >
              <Database className="h-3.5 w-3.5" aria-hidden />
              Browse resources
            </Link>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
