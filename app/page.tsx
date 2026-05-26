"use client";

import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import DataNexus from "@/components/landing/DataNexus";

const steps = [
  {
    id: "01",
    title: "Discovery",
    desc: "AI monitors inbound channels, flags high-value revenue threads and urgent customer signals before they slip.",
  },
  {
    id: "02",
    title: "Intake",
    desc: "Every lead is classified, risk-scored, and intent-tagged so the team works the right queue first.",
  },
  {
    id: "03",
    title: "Rescue",
    desc: "At-risk deals and churn cues trigger empathetic draft replies you can ship in one approval pass.",
  },
  {
    id: "04",
    title: "Approval",
    desc: "Review, edit, and approve AI drafts while preserving voice — no copy/paste loops.",
  },
  {
    id: "05",
    title: "Execution",
    desc: "CRM-aware follow-ups, stage updates, and reminders keep revenue motion continuous.",
  },
  {
    id: "06",
    title: "Growth",
    desc: "Command Center metrics surface saved revenue, throughput, and satisfaction in one flat view.",
  },
];

function Crosshair({ className }: { className?: string }) {
  return (
    <span
      className={`pointer-events-none select-none font-mono text-xs leading-none text-black dark:text-white ${className ?? ""}`}
      aria-hidden
    >
      +
    </span>
  );
}

function TechPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative border border-black bg-white dark:border-white dark:bg-[#0a1018] ${className}`}
    >
      <Crosshair className="absolute left-1 top-1" />
      <Crosshair className="absolute right-1 top-1" />
      <Crosshair className="absolute bottom-1 left-1" />
      <Crosshair className="absolute bottom-1 right-1" />
      {children}
    </div>
  );
}

function RulerTicks({ vertical }: { vertical?: boolean }) {
  const count = vertical ? 28 : 36;
  return (
    <div
      className={`pointer-events-none shrink-0 border-black bg-white dark:bg-[#0a1018] dark:border-white ${
        vertical
          ? "hidden min-h-[380px] w-5 flex-col border-l md:flex"
          : "flex h-5 w-full flex-row border-t"
      }`}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={
            vertical
              ? `flex-1 border-b border-black/20 dark:border-white/15 ${i % 4 === 0 ? "border-black dark:border-white" : ""}`
              : `flex-1 border-r border-black/20 dark:border-white/15 ${i % 4 === 0 ? "border-black dark:border-white" : ""}`
          }
        />
      ))}
    </div>
  );
}

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
      initial={reduce ? undefined : { opacity: 0, y: 28 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.22 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function LandingPage() {
  const reduce = useReducedMotion();

  return (
    <div className="min-h-0 flex-1 bg-ref-mint text-black selection:bg-ref-cta/15 dark:bg-[#05080c] dark:text-white dark:selection:bg-emerald-500/20">
      <ScrollReveal>
        <section className="relative border-b border-black px-4 py-12 md:px-8 md:py-20 dark:border-white">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-12 lg:items-start lg:gap-6">
            <div className="order-2 flex flex-col gap-0 lg:order-1 lg:col-span-3">
              <RulerTicks />
              <TechPanel className="p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-black/70 dark:text-white/70">
                  + Transaction envelope
                </p>
                <dl className="mt-4 space-y-3 font-mono text-xs leading-relaxed">
                  <div>
                    <dt className="text-black/55 dark:text-white/55">+ TRANSACTION_ID</dt>
                    <dd className="mt-1 tabular-nums">NXS-7F2A-91C4-00E1</dd>
                  </div>
                  <div>
                    <dt className="text-black/55 dark:text-white/55">+ LOCATION</dt>
                    <dd className="mt-1 tabular-nums">LAT 40.7128 / LNG -74.0060</dd>
                  </div>
                  <div>
                    <dt className="text-black/55 dark:text-white/55">+ INTENT_SCORE</dt>
                    <dd className="mt-1 tabular-nums">0.94 (HIGH)</dd>
                  </div>
                </dl>
                <div className="mt-6 border-t border-dashed border-black pt-4 font-mono text-[10px] uppercase tracking-widest text-black/60 dark:border-white dark:text-white/60">
                  SYS_NODE [X:104, Y:552]
                </div>
              </TechPanel>
            </div>

            <div className="order-1 flex min-h-[480px] flex-col border-2 border-black bg-ref-ice dark:border-white dark:bg-[#0c141f] lg:order-2 lg:col-span-6">
              <div className="flex min-h-[420px] flex-1 flex-col md:flex-row md:items-stretch">
                <RulerTicks vertical />
                <div className="relative flex flex-1 flex-col items-center justify-center px-6 py-10 md:px-10 md:py-14">
                  <div
                    className="pointer-events-none absolute inset-x-6 top-6 h-px border-t border-dashed border-black/40 dark:border-white/30"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute inset-x-6 bottom-6 h-px border-t border-dashed border-black/40 dark:border-white/30"
                    aria-hidden
                  />

                  <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-black/60 dark:text-white/55">
                    [ LIVE_INBOX_STREAM ]
                  </p>
                  <h1 className="mt-6 max-w-3xl text-center font-sans text-3xl font-black uppercase leading-[1.05] tracking-tighter text-black sm:text-4xl md:text-5xl dark:text-white">
                    The revenue &amp; AI engine for modern founders
                  </h1>
                  <p className="mx-auto mt-8 max-w-xl text-center font-mono text-sm leading-relaxed text-black/80 dark:text-white/75">
                    Monospace telemetry. Forest actions. Ice panels. No gradients, no stock photography — just
                    inbox intelligence and approval loops you control.
                  </p>

                  <motion.div
                    className="relative mt-10 h-[220px] w-full max-w-md md:h-[280px]"
                    initial={reduce ? undefined : { opacity: 0, scale: 0.98 }}
                    whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
                    viewport={{ once: true, amount: 0.35 }}
                    transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="absolute inset-0 z-0">
                      <Canvas camera={{ position: [0, 0, 3.2], fov: 42 }} dpr={[1, 2]}>
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[6, 8, 4]} intensity={0.9} />
                        <DataNexus />
                      </Canvas>
                    </div>
                  </motion.div>

                  <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                    <Link
                      href="/signup"
                      className="cursor-pointer border border-black bg-ref-cta px-8 py-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-[#f3f6f1] transition-opacity hover:opacity-90 dark:border-white dark:bg-[#1a2e22]"
                    >
                      Initialize workspace
                    </Link>
                    <Link
                      href="/login"
                      className="cursor-pointer border border-black bg-white px-8 py-3 font-mono text-xs uppercase tracking-[0.2em] text-black transition-colors hover:bg-ref-mint dark:border-white dark:bg-[#0a1018] dark:text-white dark:hover:bg-[#0c141f]"
                    >
                      Sign in
                    </Link>
                  </div>
                </div>
                <RulerTicks vertical />
              </div>
              <RulerTicks />
            </div>

            <div className="order-3 flex flex-col gap-0 lg:col-span-3">
              <RulerTicks />
              <TechPanel className="bg-white p-5 dark:bg-[#0a1018]">
                <div className="flex items-start justify-between gap-3 border-b border-black pb-4 dark:border-white">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-black/60 dark:text-white/55">
                      Inbound / Gmail
                    </p>
                    <p className="mt-2 font-sans text-sm font-black uppercase tracking-tight">Thread capture</p>
                  </div>
                  <div className="h-9 w-9 shrink-0 border border-black font-mono text-xs leading-9 text-center dark:border-white">
                    N
                  </div>
                </div>
                <div className="mt-4 space-y-2 font-mono text-xs">
                  <p className="text-black/70 dark:text-white/65">MERCHANT</p>
                  <p className="font-semibold text-black dark:text-white">Acme Logistics — renewal</p>
                  <p className="text-black/55 dark:text-white/55">TIMESTAMP_UTC</p>
                  <p className="tabular-nums">2026-05-26T05:29:00Z</p>
                </div>
                <p className="mt-6 border-t border-dashed border-black pt-4 text-right font-mono text-lg font-semibold tabular-nums text-black dark:border-white dark:text-white">
                  −$0.00
                </p>
                <p className="mt-1 text-right font-mono text-[10px] uppercase tracking-widest text-black/50 dark:text-white/45">
                  sandbox / no charge
                </p>
              </TechPanel>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section
          id="protocol"
          className="border-b border-black bg-white px-4 py-20 md:px-8 md:py-24 dark:border-white dark:bg-[#05080c]"
        >
          <div className="mx-auto max-w-4xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-black/55 dark:text-white/50">
              [ SECTION / 00 ]
            </p>
            <h2 className="mt-4 font-sans text-3xl font-black uppercase tracking-tighter text-black md:text-4xl dark:text-white">
              Flat protocol
            </h2>
            <p className="mt-6 max-w-2xl font-mono text-sm leading-relaxed text-black/75 dark:text-white/70">
              Six ordered stages. Dashed connectors. Each card is a terminal surface: black hairline border, white
              field, monospace copy. No glass, no glow.
            </p>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section
          id="process"
          className="border-b border-black bg-ref-mint px-4 py-20 md:px-8 md:py-24 dark:border-white dark:bg-[#080c10]"
        >
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-sans text-3xl font-black uppercase tracking-tighter text-black md:text-4xl dark:text-white">
              Pipeline
            </h2>
            <p className="mx-auto mt-4 max-w-xl font-mono text-sm text-black/70 dark:text-white/65">
              Six-step protocol — strict vertical rhythm, dashed spine, alternating offsets.
            </p>
          </div>

          <div className="relative mx-auto mt-16 max-w-3xl px-0 md:mt-20">
            <div
              className="absolute left-1/2 top-0 hidden h-full w-0 -translate-x-1/2 border-l border-dashed border-black md:block dark:border-white"
              aria-hidden
            />
            <div className="flex flex-col gap-14 md:gap-20">
              {steps.map((step, index) => {
                const isEven = index % 2 === 0;
                return (
                  <div
                    key={step.id}
                    className={`relative flex w-full ${isEven ? "md:justify-start" : "md:justify-end"}`}
                  >
                    <TechPanel
                      className={`w-full max-w-xl p-7 md:p-10 ${isEven ? "md:mr-[8%]" : "md:ml-[8%]"}`}
                    >
                      <span className="font-mono text-sm font-bold tabular-nums tracking-widest text-ref-cta dark:text-emerald-300/90">
                        {step.id}
                      </span>
                      <h3 className="mt-4 font-sans text-2xl font-black uppercase tracking-tight text-black md:text-3xl dark:text-white">
                        {step.title}
                      </h3>
                      <p className="mt-4 font-mono text-sm leading-relaxed text-black/80 dark:text-white/75">
                        {step.desc}
                      </p>
                    </TechPanel>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="border-b border-black bg-white px-4 py-24 md:px-8 md:py-28 dark:border-white dark:bg-[#05080c]">
          <div className="mx-auto max-w-4xl border border-black bg-ref-ice p-8 md:p-14 dark:border-white dark:bg-[#0c141f]">
            <Crosshair className="mb-6 inline-block" />
            <blockquote className="font-sans text-2xl font-black uppercase leading-snug tracking-tighter text-black md:text-3xl dark:text-white">
              We built Nexus OS so founders do not trade time for revenue — they run both on one grid.
            </blockquote>
            <div className="mt-10 flex flex-col gap-2 border-t border-dashed border-black pt-6 font-mono text-xs uppercase tracking-[0.25em] text-black/60 dark:border-white dark:text-white/55">
              <span>Origin: Nexus Team</span>
              <span className="tabular-nums">REF / MANIFESTO / 001</span>
            </div>
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}
