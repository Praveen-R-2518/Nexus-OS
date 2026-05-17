"use client";

import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { motion, useInView } from "framer-motion";
import { ChevronsRight } from "lucide-react";
import Link from "next/link";
import { Tangerine } from "next/font/google";
import DataNexus from "@/components/landing/DataNexus";
import { ThemeToggle } from "@/components/ThemeToggle";
import Image from "next/image";

const tangerine = Tangerine({ subsets: ["latin"], weight: ["400", "700"] });

const steps = [
  { id: "01", title: "Discovery", desc: "Our AI continuously monitors your communication channels, instantly identifying high-value revenue opportunities and urgent customer needs before they escalate." },
  { id: "02", title: "Intake", desc: "Every incoming lead is automatically classified, scored for risk, and categorized by intent, ensuring your team focuses on what matters most." },
  { id: "03", title: "Rescue", desc: "Proactively flags at-risk deals and churn signals, instantly drafting context-aware, empathetic responses to save the relationship." },
  { id: "04", title: "Approval", desc: "Review, edit, and approve AI-drafted replies in a single click. Maintain your brand's voice while saving hours of manual drafting." },
  { id: "05", title: "Execution", desc: "Seamlessly integrates with your existing CRM to automate follow-ups, update deal stages, and ensure no opportunity slips through the cracks." },
  { id: "06", title: "Growth", desc: "Monitor your saved revenue, team efficiency, and customer satisfaction metrics in real-time through your centralized Command Center." },
];

function StepCard({ step, index }: { step: { id: string; title: string; desc: string }; index: number }) {
  const isEven = index % 2 === 0;
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, {
    once: false,
    amount: "some",
    margin: "0px",
  });
  const enterStagger = Math.min(index * 0.05, 0.2);

  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={{
        opacity: isInView ? 1 : 0,
        x: isInView ? 0 : isEven ? -28 : 28,
        y: isInView ? 0 : 16,
      }}
      transition={{
        opacity: {
          duration: 0.45,
          ease: [0.25, 0.1, 0.25, 1],
          delay: isInView ? enterStagger : 0,
        },
        x: {
          duration: 0.45,
          ease: [0.25, 0.1, 0.25, 1],
          delay: isInView ? enterStagger : 0,
        },
        y: {
          duration: 0.45,
          ease: [0.25, 0.1, 0.25, 1],
          delay: isInView ? enterStagger : 0,
        },
      }}
      className={`landing-glass-card p-10 md:p-12 rounded-3xl flex flex-col gap-4 relative overflow-hidden group w-full max-w-2xl ${
        isEven ? "md:self-start" : "md:self-end"
      }`}
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-trajectory-blue/0 via-trajectory-blue/50 to-trajectory-blue/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <span className="text-trajectory-blue font-mono text-lg font-bold tracking-widest">{step.id}</span>
      <h3 className="text-3xl md:text-4xl font-semibold text-slate-900 dark:text-atmospheric-grey tracking-tight">{step.title}</h3>
      <p className="text-lg text-slate-600 dark:text-atmospheric-grey/70 leading-relaxed">{step.desc}</p>
    </motion.div>
  );
}

export default function LandingPage() {
  const containerRef = useRef(null);

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-obsidian selection:bg-trajectory-blue/30" ref={containerRef}>
      <div className="pointer-events-auto fixed right-4 top-4 z-50 md:right-6 md:top-6">
        <div className="rounded-xl border border-slate-200/80 bg-white/85 p-1 shadow-md backdrop-blur-sm dark:border-white/15 dark:bg-slate-950/70">
          <ThemeToggle />
        </div>
      </div>

      {/* Hero Section */}
      <section className="relative flex h-screen items-center justify-center overflow-hidden border-b border-trajectory-blue/15 dark:border-trajectory-blue/25">
        {/* 3D Background */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <DataNexus />
            <Environment preset="city" />
          </Canvas>
        </div>

        {/* Foreground Content */}
        <motion.div
          className="z-10 flex flex-col items-center text-center px-6 max-w-4xl mx-auto"
        >
          <div className="animate-fade-up [animation-delay:0ms]">
            <h1 className="text-[64px] font-medium tracking-[-1.28px] text-slate-900 dark:text-atmospheric-grey leading-[1.1] mb-6">
              Deploy Your Revenue <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-trajectory-blue to-blue-400">
                Command Center.
              </span>
            </h1>
          </div>

          <div className="animate-fade-up [animation-delay:200ms]">
            <p className="text-lg font-semibold leading-relaxed text-slate-900 dark:text-atmospheric-grey mb-10 max-w-2xl mx-auto drop-shadow-sm">
              The AI-powered Small Business Management Dashboard for busy founders. 
              Engineered for precision, speed, and absolute control.
            </p>
          </div>

          <div className="animate-fade-up [animation-delay:400ms]">
            <Link
              href="/login"
              className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-900 dark:bg-atmospheric-grey text-white dark:text-obsidian font-semibold rounded-full overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-surface-elevated/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative">Get Started</span>
              <ChevronsRight className="relative w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </motion.div>
        
      </section>

      {/* Process Section */}
      <section className="relative py-32 px-6 max-w-5xl mx-auto">
        <div className="mb-32 text-center">
          <h2 className="text-4xl md:text-5xl font-medium tracking-tight text-slate-900 dark:text-atmospheric-grey mb-6">The Process</h2>
          <p className="text-xl text-slate-500 dark:text-atmospheric-grey/60 max-w-2xl mx-auto">A six-step protocol to reclaim your time and revenue.</p>
        </div>

        <div className="relative flex flex-col gap-16 md:gap-24">
          {/* Central connecting line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-trajectory-blue/0 via-trajectory-blue/35 dark:via-trajectory-blue/20 to-trajectory-blue/0 hidden md:block -translate-x-1/2" />
          
          {steps.map((step, index) => (
            <StepCard key={step.id} step={step} index={index} />
          ))}
        </div>
      </section>

      {/* Quote & Logo Section */}
      <section className="relative py-32 px-6 flex flex-col items-center justify-center border-t-2 border-[#BDB6AD] dark:border-white/5 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 dark:from-obsidian via-trajectory-blue/5 to-slate-50 dark:to-obsidian pointer-events-none" />
        
        <div className="relative z-10 max-w-4xl mx-auto text-center flex flex-col items-center">
          <div className="relative mb-16">
            <div className="relative flex h-28 w-80 items-center justify-center md:h-32 md:w-96">
              <Image
                src="/logo.png"
                alt="Nexus OS Logo"
                fill
                className="object-contain scale-105 md:scale-110 dark:brightness-125"
                priority
              />
            </div>
          </div>
          
          <blockquote
            className={`text-5xl md:text-7xl text-slate-800 leading-relaxed dark:text-neutral-100 dark:[text-shadow:0_2px_24px_rgba(0,0,0,0.45)] ${tangerine.className}`}
          >
            &quot;We built Nexus OS because founders shouldn&apos;t have to choose between saving time and saving revenue.&quot;
          </blockquote>
          <div className="mt-12 flex flex-col items-center gap-3">
            <div className="w-12 h-0.5 rounded-full bg-trajectory-blue/55 dark:bg-trajectory-blue/50" />
            <span className="text-sm font-medium uppercase tracking-widest text-trajectory-blue">The Nexus Team</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t-2 border-[#BDB6AD] dark:border-white/10 bg-slate-50 dark:bg-obsidian py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-center md:text-left">
            <span className="font-mono text-sm font-bold tracking-widest text-slate-900 dark:text-atmospheric-grey">NEXUS OS</span>
            <span className="hidden md:inline text-slate-400 dark:text-atmospheric-grey/40 text-sm">|</span>
            <span className="text-slate-400 dark:text-atmospheric-grey/40 text-sm">© {new Date().getFullYear()} All rights reserved.</span>
            <span className="hidden md:inline text-slate-400 dark:text-atmospheric-grey/40 text-sm">|</span>
            <span className="text-slate-500 dark:text-atmospheric-grey/60 text-sm font-medium">Developed by Knurdz 3.0</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500 dark:text-atmospheric-grey/60">
            <Link href="#" className="hover:text-trajectory-blue transition-colors">Privacy Policy</Link>
            <Link href="#" className="hover:text-trajectory-blue transition-colors">Terms of Service</Link>
            <Link href="#" className="hover:text-trajectory-blue transition-colors">Contact Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
