"use client";

import { useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import { motion, useScroll, useTransform } from "framer-motion";
import { ChevronsRight } from "lucide-react";
import Link from "next/link";
import DataNexus from "@/components/landing/DataNexus";

const steps = [
  { id: "01", title: "Discovery", desc: "AI scans your inbox for revenue opportunities." },
  { id: "02", title: "Intake", desc: "Classifies and categorizes incoming leads." },
  { id: "03", title: "Rescue", desc: "Identifies at-risk deals and drafts responses." },
  { id: "04", title: "Approval", desc: "You review AI-drafted replies in one click." },
  { id: "05", title: "Execution", desc: "Automated follow-ups and CRM syncing." },
  { id: "06", title: "Growth", desc: "Monitor metrics in your Command Center." },
];

function StepCard({ step, index }: { step: { id: string; title: string; desc: string }; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{
        type: "spring",
        mass: 1,
        stiffness: 100,
        damping: 20,
        delay: index * 0.1,
      }}
      className="glass-panel p-8 rounded-2xl flex flex-col gap-4 relative overflow-hidden group"
    >
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-trajectory-blue/0 via-trajectory-blue/50 to-trajectory-blue/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <span className="text-trajectory-blue font-mono text-sm font-bold tracking-widest">{step.id}</span>
      <h3 className="text-2xl font-semibold text-atmospheric-grey tracking-tight">{step.title}</h3>
      <p className="text-atmospheric-grey/70 leading-relaxed">{step.desc}</p>
    </motion.div>
  );
}

export default function LandingPage() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.2], [1, 0.9]);

  return (
    <div className="relative min-h-screen bg-obsidian selection:bg-trajectory-blue/30" ref={containerRef}>
      {/* Hero Section */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
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
          style={{ opacity, scale }}
        >
          <div className="animate-fade-up [animation-delay:0ms]">
            <h1 className="text-[64px] font-medium tracking-[-1.28px] text-atmospheric-grey leading-[1.1] mb-6">
              Deploy Your Revenue <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-trajectory-blue to-blue-400">
                Command Center.
              </span>
            </h1>
          </div>

          <div className="animate-fade-up [animation-delay:200ms]">
            <p className="text-lg text-atmospheric-grey/60 mb-10 max-w-2xl mx-auto font-light">
              The AI-powered Small Business Management Dashboard for busy founders. 
              Engineered for precision, speed, and absolute control.
            </p>
          </div>

          <div className="animate-fade-up [animation-delay:400ms]">
            <Link
              href="/dashboard"
              className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 bg-atmospheric-grey text-obsidian font-semibold rounded-full overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative">Start Project</span>
              <ChevronsRight className="relative w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </motion.div>
        
        {/* Scroll Indicator */}
        <motion.div 
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-atmospheric-grey/40"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="text-xs font-mono uppercase tracking-widest">System Online</span>
          <div className="w-[1px] h-12 bg-gradient-to-b from-atmospheric-grey/40 to-transparent" />
        </motion.div>
      </section>

      {/* Process Section */}
      <section className="relative py-32 px-6 max-w-6xl mx-auto">
        <div className="mb-20 text-center">
          <h2 className="text-4xl font-medium tracking-tight text-atmospheric-grey mb-4">The Process</h2>
          <p className="text-atmospheric-grey/60">A six-step protocol to reclaim your time and revenue.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <StepCard key={step.id} step={step} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
