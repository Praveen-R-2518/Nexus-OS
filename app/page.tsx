"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";

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

function ScrollReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? undefined : { opacity: 0, y: 40 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.15 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen flex-1 bg-[#111111] text-white selection:bg-white/20">
      <ScrollReveal className="flex min-h-screen flex-col items-center justify-center px-4 py-20 text-center">
        <div className="relative flex flex-col items-center">
          <h1 className="relative z-10 max-w-5xl font-sans text-4xl font-black uppercase leading-[1.15] tracking-[0.2em] bg-gradient-to-b from-[#a5acb9] to-[#303643] bg-clip-text text-transparent sm:text-5xl md:text-6xl lg:text-[4.6rem]">
            THE REVENUE &amp; AI
            <br />
            ENGINE FOR MODERN
            <br />
            FOUNDERS
          </h1>

          <div className="relative -mt-16 h-[340px] w-full max-w-[240px] z-0 opacity-20 pointer-events-none select-none">
            <img
              src="/coin-sketch.png"
              alt="Coin Sketch"
              className="w-full h-full object-contain mix-blend-screen"
            />
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-6">
          <Link
            href="/signup"
            className="rounded-full border border-white/20 bg-white/5 px-8 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-white backdrop-blur-md transition-all duration-300 hover:bg-white hover:text-black hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]"
          >
            Initialize workspace
          </Link>
          <Link
            href="/login"
            className="rounded-full px-8 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-gray-300 transition-all duration-300 hover:text-white hover:bg-white/10"
          >
            Sign in
          </Link>
        </div>
      </ScrollReveal>

      <ScrollReveal className="px-4 py-24 md:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-sans text-4xl font-medium tracking-tight text-white md:text-5xl">
            The Process
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            A six-step protocol to reclaim your time and revenue.
          </p>
        </div>

        <div className="mx-auto mt-20 max-w-4xl space-y-8 md:space-y-16">
          {steps.map((step, index) => {
            const isEven = index % 2 === 0;
            return (
              <ScrollReveal
                key={step.id}
                className={`flex ${isEven ? "justify-start" : "justify-end"}`}
              >
                <div className="w-full md:w-[60%] rounded-[2rem] border border-white/15 bg-[#161a22] p-8 shadow-xl backdrop-blur-md transition-all hover:bg-[#1c212b] hover:border-white/35">
                  <span className="font-mono text-sm font-bold tracking-widest bg-gradient-to-b from-slate-100 to-slate-400 bg-clip-text text-transparent">
                    {step.id}
                  </span>
                  <h3 className="mt-4 font-sans text-2xl font-semibold tracking-tight text-white md:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-slate-200">
                    {step.desc}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </ScrollReveal>

      <ScrollReveal className="px-4 py-32 md:px-8">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] border border-white/20 bg-white/10 p-12 md:p-20 backdrop-blur-xl shadow-2xl transition-all duration-500 hover:border-white/35">
          <blockquote className="text-center font-sans text-2xl font-light leading-relaxed tracking-wider text-white/90 md:text-3xl lg:text-4xl">
            "We built Nexus OS so founders do not trade time for revenue — they run both on one grid."
          </blockquote>
          <div className="mt-16 flex justify-center">
             <div className="rounded-full border border-white/20 bg-white/10 px-6 py-2.5 font-mono text-xs uppercase tracking-widest text-gray-300 backdrop-blur-sm">
               Origin: Nexus Team
             </div>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
