"use client";

import Link from "next/link";
import { Style_Script } from "next/font/google";
import { ArrowUpRight, Clock, Quote, ShieldCheck, TrendingUp } from "lucide-react";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";

const styleScript = Style_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-style-script",
  display: "swap",
});

const stats = [
  {
    value: "$4.2M+",
    label: "Revenue rescued",
    desc: "At-risk deals recovered across teams running Nexus OS.",
    icon: TrendingUp,
  },
  {
    value: "37%",
    label: "Lower churn",
    desc: "Average drop in logo churn within the first two quarters.",
    icon: ShieldCheck,
  },
  {
    value: "11 hrs",
    label: "Saved weekly",
    desc: "Per operator, by automating triage and reply drafting.",
    icon: Clock,
  },
];

type CaseStudy = {
  company: string;
  segment: string;
  challenge: string;
  outcome: string;
  metric: string;
  metricLabel: string;
};

const caseStudies: CaseStudy[] = [
  {
    company: "Northwind SaaS",
    segment: "B2B Software · 40 seats",
    challenge:
      "High-intent trial users were slipping through a noisy shared inbox before sales could respond.",
    outcome:
      "Nexus OS flagged purchase intent in real time and drafted replies, cutting first-response time from hours to minutes.",
    metric: "+28%",
    metricLabel: "trial-to-paid conversion",
  },
  {
    company: "Atlas Logistics",
    segment: "Operations · 120 seats",
    challenge:
      "Churn signals were buried in support threads and only surfaced after customers had already decided to leave.",
    outcome:
      "Churn detection routed at-risk accounts to a save-team queue with context-aware draft outreach.",
    metric: "-41%",
    metricLabel: "quarterly churn",
  },
  {
    company: "Meridian Studio",
    segment: "Agency · 18 seats",
    challenge:
      "Founders were personally triaging every email, spending evenings on manual follow-ups.",
    outcome:
      "The Approval Queue let the team approve AI drafts in one click while keeping their brand voice.",
    metric: "9 hrs",
    metricLabel: "reclaimed per week",
  },
];

const testimonials = [
  {
    quote:
      "Nexus OS pays for itself the first time it saves a deal we would have missed. It is the operating system our revenue runs on.",
    name: "Priya N.",
    role: "Founder, Northwind SaaS",
  },
  {
    quote:
      "We finally see churn coming. The save-team gets a warm draft before the customer even asks to cancel.",
    name: "Marcus T.",
    role: "Head of Success, Atlas Logistics",
  },
];

const logos = [
  "Northwind",
  "Atlas",
  "Meridian",
  "Lumen",
  "Halcyon",
  "Vertex",
];

export default function CustomersPage() {
  return (
    <div className={`flex flex-1 flex-col ${styleScript.variable}`}>
      <ScrollReveal className="hairline-b pb-12 pt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-ref-cta dark:text-muted">
          Customers
        </p>
        <h1 className="mt-3 max-w-3xl font-sans text-4xl font-black uppercase leading-[1.05] tracking-tighter text-atmospheric-grey sm:text-5xl md:text-6xl">
          Revenue teams that stopped losing deals
        </h1>
        <p className="mt-5 max-w-2xl font-mono text-sm leading-relaxed text-muted">
          From solo founders to 120-seat operations, teams use Nexus OS to
          intercept churn, route hot leads, and reclaim hours every week.
        </p>
      </ScrollReveal>

      <div className="grid gap-4 py-12 sm:grid-cols-3">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <ScrollReveal
              key={stat.label}
              delay={i * 0.08}
              className="h-full"
            >
              <div className="flex h-full flex-col rounded-2xl border border-border bg-white p-7 dark:border-border dark:bg-surface-card">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-ref-cta dark:border-white/15 dark:text-muted">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-5 text-4xl font-bold tabular-nums tracking-tight text-status-positive">
                  {stat.value}
                </p>
                <p className="mt-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-atmospheric-grey">
                  {stat.label}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {stat.desc}
                </p>
              </div>
            </ScrollReveal>
          );
        })}
      </div>

      <ScrollReveal className="py-8">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl border border-border bg-white px-6 py-8 dark:border-border dark:bg-surface-card">
          {logos.map((logo) => (
            <span
              key={logo}
              className="font-sans text-lg font-black uppercase tracking-tight text-atmospheric-grey/40 transition-colors hover:text-atmospheric-grey dark:text-white/30 dark:hover:text-white"
            >
              {logo}
            </span>
          ))}
        </div>
      </ScrollReveal>

      <div className="space-y-6 py-12">
        <ScrollReveal>
          <h2 className="font-sans text-2xl font-black uppercase tracking-tight text-atmospheric-grey md:text-3xl">
            Case studies
          </h2>
        </ScrollReveal>
        <div className="grid gap-5 lg:grid-cols-3">
          {caseStudies.map((cs, i) => (
            <ScrollReveal key={cs.company} delay={i * 0.08} className="h-full">
              <article className="flex h-full flex-col rounded-2xl border border-border bg-white p-7 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-white/15 dark:bg-[#161616] dark:hover:border-white/35 dark:hover:bg-[#1f1f1f]">
                <h3 className="font-sans text-xl font-semibold tracking-tight text-atmospheric-grey">
                  {cs.company}
                </h3>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {cs.segment}
                </p>
                <p className="mt-5 text-sm leading-relaxed text-muted dark:text-slate-300">
                  <span className="font-semibold text-atmospheric-grey">
                    Challenge.{" "}
                  </span>
                  {cs.challenge}
                </p>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted dark:text-slate-300">
                  <span className="font-semibold text-atmospheric-grey">
                    Outcome.{" "}
                  </span>
                  {cs.outcome}
                </p>
                <div className="mt-6 hairline-t pt-5">
                  <p className="text-3xl font-bold tabular-nums tracking-tight text-status-positive">
                    {cs.metric}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                    {cs.metricLabel}
                  </p>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>

      <div className="grid gap-5 py-12 md:grid-cols-2">
        {testimonials.map((t, i) => (
          <ScrollReveal key={t.name} delay={i * 0.1} className="h-full">
            <figure className="flex h-full flex-col rounded-[2rem] border border-border bg-[#f8fafc] p-10 dark:border-white/20 dark:bg-[#1c1c1c]">
              <Quote
                className="h-7 w-7 text-ref-cta dark:text-muted"
                aria-hidden
              />
              <blockquote
                className="mt-5 flex-1 text-2xl leading-relaxed text-slate-900 dark:text-white/90 md:text-3xl"
                style={{ fontFamily: "var(--font-style-script), cursive" }}
              >
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-muted">
                <span className="text-atmospheric-grey">{t.name}</span> — {t.role}
              </figcaption>
            </figure>
          </ScrollReveal>
        ))}
      </div>

      <ScrollReveal className="pb-16">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[2rem] border border-border bg-white p-10 dark:border-border dark:bg-surface-card md:flex-row md:items-center">
          <div>
            <h2 className="font-sans text-xl font-black uppercase tracking-tight text-atmospheric-grey">
              Your team could be next
            </h2>
            <p className="mt-2 max-w-xl font-mono text-sm leading-relaxed text-muted">
              See how much revenue Nexus OS can rescue for your operation.
            </p>
          </div>
          <Link
            href="/signup"
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-ref-cta px-6 py-3 font-mono text-[10px] font-medium uppercase tracking-widest text-[#f4f8fc] transition-opacity hover:opacity-90 dark:border-border dark:bg-ref-cta dark:text-[#f4f8fc]"
          >
            Start now
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </ScrollReveal>
    </div>
  );
}
