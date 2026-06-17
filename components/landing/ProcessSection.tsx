"use client";

import { ScrollReveal } from "@/components/marketing/ScrollReveal";

const steps = [
  {
    id: "01",
    title: "Discovery",
    desc: "Our AI continuously monitors your communication channels, instantly identifying high-value revenue opportunities and urgent customer needs before they escalate.",
  },
  {
    id: "02",
    title: "Intake",
    desc: "Every incoming lead is automatically classified, scored for risk, and categorized by intent, ensuring your team focuses on what matters most.",
  },
  {
    id: "03",
    title: "Rescue",
    desc: "Proactively flags at-risk deals and churn signals, instantly drafting context-aware, empathetic responses to save the relationship.",
  },
  {
    id: "04",
    title: "Approval",
    desc: "Review, edit, and approve AI-drafted replies in a single click. Maintain your brand's voice while saving hours of manual drafting.",
  },
  {
    id: "05",
    title: "Execution",
    desc: "Seamlessly integrates with your existing CRM to automate follow-ups, update deal stages, and ensure no opportunity slips through the cracks.",
  },
  {
    id: "06",
    title: "Growth",
    desc: "Monitor your saved revenue, team efficiency, and customer satisfaction metrics in real-time through your centralized Command Center.",
  },
];

export function ProcessSection() {
  return (
    <section className="apple-section bg-apple-bg-alt">
      <div className="apple-section-content text-center">
        <ScrollReveal>
          <p className="apple-eyebrow">The Process</p>
          <h2 className="apple-section-headline mt-3 text-apple-text">
            A six-step protocol to reclaim your time and revenue.
          </h2>
        </ScrollReveal>

        <div className="mt-16 space-y-6 md:mt-20 md:space-y-8">
          {steps.map((step, index) => (
            <ScrollReveal key={step.id} delay={index * 0.05}>
              <article className="rounded-2xl border border-[color:var(--apple-hairline)] bg-apple-bg p-8 text-left shadow-sm transition-shadow duration-300 hover:shadow-md md:p-10">
                <span className="font-mono text-xs font-semibold tracking-widest text-apple-text-secondary">
                  {step.id}
                </span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-apple-text md:text-3xl">
                  {step.title}
                </h3>
                <p className="apple-body mt-4">{step.desc}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
