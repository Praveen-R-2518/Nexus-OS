"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Style_Script } from "next/font/google";

const styleScript = Style_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-style-script",
  display: "swap",
});

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
    <div className={`min-h-screen flex-1 bg-surface-page text-atmospheric-grey selection:bg-black/10 dark:selection:bg-white/20 ${styleScript.variable}`}>
      <ScrollReveal className="flex min-h-screen flex-col items-center justify-center px-4 py-20 text-center">
        <div className="relative flex flex-col items-center">
          <h1 className="relative z-10 max-w-5xl font-sans text-4xl font-black uppercase leading-[1.15] tracking-[0.2em] bg-gradient-to-b from-[#334155] to-[#0f172a] dark:from-[#a5acb9] dark:to-[#303643] bg-clip-text text-transparent sm:text-5xl md:text-6xl lg:text-[4.6rem]">
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
              className="w-full h-full object-contain mix-blend-multiply dark:mix-blend-screen dark:invert-0 invert"
            />
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-center gap-6">
          <Link
            href="/login"
            className="rounded-full border border-black/20 bg-black/5 px-8 py-4 font-sans text-xs font-semibold uppercase tracking-widest text-black backdrop-blur-md transition-all duration-300 hover:bg-black hover:text-white dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white dark:hover:text-black dark:hover:shadow-[0_0_30px_rgba(255,255,255,0.4)]"
          >
            Sign in
          </Link>
        </div>
      </ScrollReveal>

      <ScrollReveal className="px-4 py-24 md:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-sans text-4xl font-medium tracking-tight text-atmospheric-grey md:text-5xl">
            The Process
          </h2>
          <p className="mt-4 text-lg text-muted">
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
                <div className="w-full md:w-[60%] rounded-[2rem] border border-border bg-white dark:border-white/15 dark:bg-[#161616] p-8 shadow-xl backdrop-blur-md transition-all hover:bg-slate-50 hover:border-slate-300 dark:hover:bg-[#1f1f1f] dark:hover:border-white/35">
                  <span className="font-mono text-sm font-bold tracking-widest bg-gradient-to-b from-slate-500 to-slate-800 dark:from-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                    {step.id}
                  </span>
                  <h3 className="mt-4 font-sans text-2xl font-semibold tracking-tight text-atmospheric-grey md:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-muted dark:text-slate-200">
                    {step.desc}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </ScrollReveal>

      <ScrollReveal className="px-4 py-32 md:px-8">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] border border-border bg-[#f8fafc] dark:border-white/20 dark:bg-[#1c1c1c] p-12 md:p-20 backdrop-blur-xl shadow-2xl transition-all duration-500 hover:border-slate-300 hover:bg-[#f1f5f9] dark:hover:border-white/35 dark:hover:bg-[#252525]">
          <blockquote
            className="text-center text-4xl font-normal leading-relaxed tracking-normal text-slate-900 dark:text-white/90 md:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-style-script), cursive" }}
          >
            "We built Nexus OS because founders shouldn't have to choose between saving time and saving revenue."
          </blockquote>
          <div className="mt-12 flex justify-center">
             <div className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-[#a5acb9]">
               The Nexus Team
             </div>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
