"use client";

import Image, { type StaticImageData } from "next/image";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import step1Icon from "@/images/1.png";
import step2Icon from "@/images/2.png";
import step3Icon from "@/images/3.png";
import step4Icon from "@/images/4.png";
import step5Icon from "@/images/5.png";
import step6Icon from "@/images/6.png";

type ProcessStep = {
  id: string;
  title: string;
  icon: StaticImageData;
  accent: string;
  desc: React.ReactNode;
};

function AccentText({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span className="font-semibold" style={{ color }}>
      {children}
    </span>
  );
}

const steps: ProcessStep[] = [
  {
    id: "01",
    title: "Discovery",
    icon: step1Icon,
    accent: "#5d3efb",
    desc: (
      <>
        Our AI continuously monitors your communication channels, instantly
        identifying high-value revenue{" "}
        <AccentText color="#5d3efb">opportunities</AccentText> and urgent
        customer needs before they escalate.
      </>
    ),
  },
  {
    id: "02",
    title: "Intake",
    icon: step2Icon,
    accent: "#0fbda4",
    desc: (
      <>
        Every incoming lead is automatically classified, scored for risk, and
        categorized by intent, ensuring your team focuses on what{" "}
        <AccentText color="#0fbda4">matters most</AccentText>.
      </>
    ),
  },
  {
    id: "03",
    title: "Rescue",
    icon: step3Icon,
    accent: "#8b50fb",
    desc: (
      <>
        Proactively flags at-risk deals and churn signals, instantly drafting
        context-aware, empathetic responses to{" "}
        <AccentText color="#8b50fb">save</AccentText> the relationship.
      </>
    ),
  },
  {
    id: "04",
    title: "Approval",
    icon: step4Icon,
    accent: "#1274f9",
    desc: (
      <>
        Review, edit, and approve AI-drafted replies in a single click.
        Maintain your brand&apos;s voice while{" "}
        <AccentText color="#1274f9">saving hours</AccentText> of manual
        drafting.
      </>
    ),
  },
  {
    id: "05",
    title: "Execution",
    icon: step5Icon,
    accent: "#fd7201",
    desc: (
      <>
        Seamlessly integrates with your existing CRM to{" "}
        <AccentText color="#fd7201">automate</AccentText> follow-ups, update
        deal stages, and ensure no opportunity slips through the cracks.
      </>
    ),
  },
  {
    id: "06",
    title: "Growth",
    icon: step6Icon,
    accent: "#fd9f9f",
    desc: (
      <>
        Monitor your <AccentText color="#fd9f9f">saved revenue</AccentText>,
        team efficiency, and customer satisfaction metrics in real-time through
        your centralized Command Center.
      </>
    ),
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
              <article className="relative min-h-[230px] overflow-hidden rounded-2xl border border-[color:var(--apple-hairline)] bg-white p-8 pr-[42%] text-left shadow-sm transition-shadow duration-300 hover:shadow-md md:min-h-[210px] md:p-10 md:pr-[34%]">
                <div className="absolute inset-y-0 right-0 w-[38%] bg-white md:w-[30%]">
                  <Image
                    src={step.icon}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 300px, 150px"
                    className="object-contain object-right"
                    priority={index < 2}
                  />
                </div>
                <div className="relative z-10">
                  <h3
                    className="text-2xl font-semibold tracking-tight md:text-3xl"
                    style={{ color: step.accent }}
                  >
                    {step.title}
                  </h3>
                  <p className="apple-body mt-4">{step.desc}</p>
                </div>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
