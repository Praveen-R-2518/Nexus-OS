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
import { FinalCta } from "@/components/landing/FinalCta";
import { AnimatedHeading } from "@/components/landing/primitives/AnimatedHeading";
import { Eyebrow } from "@/components/landing/primitives/Eyebrow";
import { LiftButton } from "@/components/landing/primitives/LiftButton";
import { Reveal } from "@/components/landing/primitives/Reveal";
import { Section } from "@/components/landing/primitives/Section";
import { TracedCard } from "@/components/landing/primitives/TracedCard";

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
    intro: "The models and scoring that decide what your team sees first.",
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
    intro: "Nexus OS sits on top of the tools you already run.",
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
    <div className="flex-1 bg-white text-[#1d1d1f]">
      <Section tone="page" width="wide">
        <Reveal>
          <Eyebrow>Documentation</Eyebrow>
        </Reveal>
        <AnimatedHeading
          text="Everything you need to run Nexus OS"
          className="landing-section-headline mt-5 max-w-[720px] text-balance"
        />
        <Reveal delay={0.08}>
          <p className="mt-5 max-w-[560px] text-[17px] leading-[1.55] text-[#6e6e73]">
            Guides, concepts, and integration references for the revenue command
            center. Pick a track below or jump straight into the console.
          </p>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {quickStart.map(({ step, label, href }) => (
              <Link
                key={step}
                href={href}
                className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-[color:var(--apple-hairline)] bg-white px-4 py-2 text-[14px] font-medium text-[#1d1d1f] transition-colors hover:bg-black/[0.03]"
              >
                <span className="font-mono text-[11px] text-[color:var(--nexus-approval)]">
                  {step}
                </span>
                {label}
                <ArrowUpRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        </Reveal>
      </Section>

      <nav
        aria-label="Documentation sections"
        className="border-y border-[color:var(--apple-hairline)] bg-[#f5f5f7]"
      >
        <div className="mx-auto flex max-w-[1120px] flex-wrap gap-x-6 gap-y-2 px-5 py-4 md:px-8">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="landing-link min-h-11 inline-flex items-center text-[14px] font-medium text-[#6e6e73] hover:text-[#1d1d1f]"
            >
              {section.title}
            </a>
          ))}
        </div>
      </nav>

      {sections.map((section, si) => {
        const Icon = section.icon;
        return (
          <Section
            key={section.id}
            id={section.id}
            tone={si % 2 === 0 ? "page" : "alt"}
            rule
            width="wide"
            className="scroll-mt-28"
          >
            <Reveal>
              <div className="flex items-start gap-4">
                <span className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <Eyebrow>{section.eyebrow}</Eyebrow>
                  <h2 className="landing-section-headline mt-3 text-[#1d1d1f]">
                    {section.title}
                  </h2>
                  <p className="mt-3 max-w-[560px] text-[16px] leading-[1.55] text-[#6e6e73]">
                    {section.intro}
                  </p>
                </div>
              </div>
            </Reveal>

            <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.links.map((link, index) => (
                <Reveal key={link.title} delay={index * 0.05} className="h-full">
                  <TracedCard className="flex h-full min-h-[14rem] flex-col p-6">
                    <span className="inline-flex w-fit rounded-full border border-[color:var(--apple-hairline)] bg-[#f5f5f7] px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#6e6e73]">
                      {link.tag}
                    </span>
                    <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                      {link.title}
                    </h3>
                    <p className="mt-3 flex-1 text-[14px] leading-[1.55] text-[#6e6e73]">
                      {link.desc}
                    </p>
                  </TracedCard>
                </Reveal>
              ))}
            </div>
          </Section>
        );
      })}

      <Section tone="alt" rule width="wide">
        <Reveal>
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-[color:var(--apple-hairline)] bg-white p-8 landing-elev-1 md:flex-row md:items-center md:p-10">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--nexus-approval-soft)] text-[color:var(--nexus-approval)]">
                <GraduationCap className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                  Ready to put it to work?
                </h2>
                <p className="mt-2 max-w-[480px] text-[15px] leading-[1.55] text-[#6e6e73]">
                  Spin up a workspace and approve your first AI-drafted reply today.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <LiftButton href="/signup">
                <Workflow className="mr-2 h-3.5 w-3.5" aria-hidden />
                Get started
              </LiftButton>
              <LiftButton href="/resources" variant="secondary">
                <Database className="mr-2 h-3.5 w-3.5" aria-hidden />
                Browse resources
              </LiftButton>
            </div>
          </div>
        </Reveal>
      </Section>

      <FinalCta />
    </div>
  );
}
