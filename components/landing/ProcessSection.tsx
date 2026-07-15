"use client";

import Image, { type StaticImageData } from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  buildVerticalWorkflowPath,
  buildWorkflowPath,
  circleCenter,
  circleRadius,
  relativeBox,
  type Point,
} from "@/components/landing/process-connector";
import {
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { ScrollReveal } from "@/components/marketing/ScrollReveal";
import { cn } from "@/lib/utils";
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

/** Row 1: 1→2→3. Row 2 grid cells (L→R): 6, 5, 4 — path flows 4→5→6 right to left. */
const DESKTOP_GRID: number[][] = [
  [0, 1, 2],
  [5, 4, 3],
];

/** Connector order: 1, 2, 3, 4, 5, 6 */
const PATH_FLOW_ORDER = [0, 1, 2, 3, 4, 5] as const;

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

const stepVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (index: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      delay: index * 0.08,
      ease: [0.16, 1, 0.3, 1],
    },
  }),
};

function ProcessSnakePath({
  inView,
  pathD,
  width,
  height,
}: {
  inView: boolean;
  pathD: string;
  width: number;
  height: number;
}) {
  const reduce = useReducedMotion();

  if (!pathD || width <= 0 || height <= 0) return null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
    >
      <path
        d={pathD}
        stroke="var(--apple-hairline)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <motion.path
        d={pathD}
        stroke="url(#process-workflow-gradient)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.72"
        initial={reduce ? { pathLength: 1 } : { pathLength: 0, opacity: 0.45 }}
        animate={
          inView
            ? { pathLength: 1, opacity: 0.72 }
            : reduce
              ? { pathLength: 1 }
              : { pathLength: 0, opacity: 0.45 }
        }
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />
      <defs>
        <linearGradient
          id="process-workflow-gradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="var(--nexus-approval)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--nexus-approval)" stopOpacity="0.9" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function ProcessStepColumn({
  step,
  stepIndex,
  active,
  onSelect,
  circleRef,
  cellRef,
  layout,
}: {
  step: ProcessStep;
  stepIndex: number;
  active: boolean;
  onSelect: (index: number) => void;
  circleRef: (node: HTMLDivElement | null) => void;
  cellRef?: (node: HTMLLIElement | null) => void;
  layout: "snake" | "stack";
}) {
  const reduce = useReducedMotion();

  if (layout === "stack") {
    return (
      <motion.li
        ref={cellRef}
        custom={stepIndex}
        initial={reduce ? undefined : "hidden"}
        whileInView={reduce ? undefined : "visible"}
        viewport={{ once: true, amount: 0.35 }}
        variants={stepVariants}
        className="relative z-10 flex gap-5"
      >
        <ProcessCircle
          step={step}
          stepIndex={stepIndex}
          active={active}
          onSelect={onSelect}
          circleRef={circleRef}
        />
        <ProcessStepCopy step={step} active={active} layout="stack" />
      </motion.li>
    );
  }

  return (
    <motion.li
      ref={cellRef}
      custom={stepIndex}
      initial={reduce ? undefined : "hidden"}
      whileInView={reduce ? undefined : "visible"}
      viewport={{ once: true, amount: 0.35 }}
      variants={stepVariants}
      className="relative z-10 flex flex-col items-center text-center"
    >
      <ProcessCircle
        step={step}
        stepIndex={stepIndex}
        active={active}
        onSelect={onSelect}
        circleRef={circleRef}
      />
      <ProcessStepCopy step={step} active={active} layout="snake" />
    </motion.li>
  );
}

function ProcessCircle({
  step,
  stepIndex,
  active,
  onSelect,
  circleRef,
}: {
  step: ProcessStep;
  stepIndex: number;
  active: boolean;
  onSelect: (index: number) => void;
  circleRef: (node: HTMLDivElement | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(stepIndex)}
      onMouseEnter={() => onSelect(stepIndex)}
      aria-current={active ? "step" : undefined}
      aria-label={`${step.title}, step ${step.id}`}
      className="group relative z-10 mb-5 flex shrink-0 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--nexus-approval)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--apple-bg-alt)]"
    >
      <div ref={circleRef} className="relative">
        <div
          className={cn(
            "relative isolate flex h-[5.5rem] w-[5.5rem] items-center justify-center overflow-visible rounded-full border bg-apple-bg transition-all duration-300 dark:bg-[color:var(--surface-card)] md:h-[6.25rem] md:w-[6.25rem]",
            active
              ? "scale-105 border-[3px] shadow-[0_16px_40px_-18px_var(--step-accent-glow)]"
              : "border-[color:var(--apple-hairline)] group-hover:border-[color:var(--step-accent)] group-hover:shadow-md",
          )}
          style={
            {
              "--step-accent": step.accent,
              "--step-accent-glow": `${step.accent}88`,
              borderColor: active ? step.accent : undefined,
            } as React.CSSProperties
          }
        >
          <Image
            src={step.icon}
            alt=""
            width={88}
            height={88}
            className="h-[3rem] w-[3rem] shrink-0 object-contain md:h-[3.35rem] md:w-[3.35rem]"
            priority={stepIndex < 2}
            onLoad={() => {
              window.requestAnimationFrame(() => {
                window.dispatchEvent(new Event("resize"));
              });
            }}
          />
        </div>
        <span
          className="absolute -right-1 -top-1 z-20 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums text-white shadow-sm"
          style={{ backgroundColor: step.accent }}
        >
          {step.id}
        </span>
      </div>
    </button>
  );
}

function ProcessStepCopy({
  step,
  active,
  layout,
}: {
  step: ProcessStep;
  active: boolean;
  layout: "snake" | "stack";
}) {
  return (
    <div
      className={cn(
        layout === "snake"
          ? "w-full max-w-[17rem] px-2"
          : "min-w-0 flex-1 pt-1 text-left",
      )}
    >
      <h3
        className={cn(
          "font-semibold tracking-tight text-apple-text transition-colors",
          layout === "snake" ? "text-lg md:text-xl" : "text-lg",
        )}
        style={active ? { color: step.accent } : undefined}
      >
        {step.title}
      </h3>
      <p
        className={cn(
          "mt-2 text-sm leading-relaxed text-apple-text-secondary",
          layout === "snake" && "md:text-[0.9375rem]",
        )}
      >
        {step.desc}
      </p>
    </div>
  );
}

function ProcessSnakeDesktop({
  activeIndex,
  onSelect,
  pathInView,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  pathInView: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const circleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const cellRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [pathD, setPathD] = useState("");
  const [railSize, setRailSize] = useState({ width: 0, height: 0 });

  const registerCircleRef = useCallback(
    (stepIndex: number) => (node: HTMLDivElement | null) => {
      circleRefs.current[stepIndex] = node;
    },
    [],
  );

  const registerCellRef = useCallback(
    (stepIndex: number) => (node: HTMLLIElement | null) => {
      cellRefs.current[stepIndex] = node;
    },
    [],
  );

  const updatePath = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const centers: Point[] = [];
    const radii: number[] = [];
    const cells = [];

    for (const stepIndex of PATH_FLOW_ORDER) {
      const icon = circleRefs.current[stepIndex];
      const cell = cellRefs.current[stepIndex];
      if (!icon || !cell) return;
      centers.push(circleCenter(icon, rail));
      radii.push(circleRadius(icon));
      cells.push(relativeBox(cell, rail));
    }

    if (centers.length === PATH_FLOW_ORDER.length) {
      const railRect = rail.getBoundingClientRect();
      setPathD(buildWorkflowPath(centers, radii, cells));
      setRailSize({
        width: Math.ceil(railRect.width),
        height: Math.ceil(railRect.height),
      });
    }
  }, []);

  useLayoutEffect(() => {
    updatePath();
  }, [updatePath, activeIndex]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const observer = new ResizeObserver(updatePath);
    observer.observe(rail);

    for (const stepIndex of PATH_FLOW_ORDER) {
      const icon = circleRefs.current[stepIndex];
      const cell = cellRefs.current[stepIndex];
      if (icon) observer.observe(icon);
      if (cell) observer.observe(cell);
    }

    window.addEventListener("resize", updatePath);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePath);
    };
  }, [updatePath, activeIndex]);

  return (
    <div ref={railRef} className="relative mx-auto mt-16 max-w-[1060px] overflow-visible px-2 md:mt-20">
      <ProcessSnakePath
        inView={pathInView}
        pathD={pathD}
        width={railSize.width}
        height={railSize.height}
      />

      <ol className="relative z-10 grid grid-cols-3 gap-x-6 gap-y-14 md:gap-x-10 md:gap-y-16">
        {DESKTOP_GRID.flat().map((stepIndex) => (
          <ProcessStepColumn
            key={steps[stepIndex].id}
            step={steps[stepIndex]}
            stepIndex={stepIndex}
            active={activeIndex === stepIndex}
            onSelect={onSelect}
            circleRef={registerCircleRef(stepIndex)}
            cellRef={registerCellRef(stepIndex)}
            layout="snake"
          />
        ))}
      </ol>
    </div>
  );
}

function ProcessSnakeMobile({
  activeIndex,
  onSelect,
  pathInView,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  pathInView: boolean;
}) {
  const railRef = useRef<HTMLOListElement>(null);
  const circleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [pathD, setPathD] = useState("");
  const [railSize, setRailSize] = useState({ width: 0, height: 0 });

  const registerCircleRef = useCallback(
    (stepIndex: number) => (node: HTMLDivElement | null) => {
      circleRefs.current[stepIndex] = node;
    },
    [],
  );

  const updatePath = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;

    const centers: Point[] = [];
    const radii: number[] = [];

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const icon = circleRefs.current[stepIndex];
      if (!icon) return;
      centers.push(circleCenter(icon, rail));
      radii.push(circleRadius(icon));
    }

    if (centers.length === steps.length) {
      const railRect = rail.getBoundingClientRect();
      const marginX = 11;
      setPathD(buildVerticalWorkflowPath(centers, radii, marginX));
      setRailSize({
        width: Math.ceil(railRect.width),
        height: Math.ceil(railRect.height),
      });
    }
  }, []);

  useLayoutEffect(() => {
    updatePath();
  }, [updatePath, activeIndex]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const observer = new ResizeObserver(updatePath);
    observer.observe(rail);

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const icon = circleRefs.current[stepIndex];
      if (icon) observer.observe(icon);
    }

    window.addEventListener("resize", updatePath);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePath);
    };
  }, [updatePath, activeIndex]);

  return (
    <ol
      ref={railRef}
      className="relative mt-12 space-y-10 overflow-visible pl-6 md:hidden"
    >
      <ProcessSnakePath
        inView={pathInView}
        pathD={pathD}
        width={railSize.width}
        height={railSize.height}
      />

      {steps.map((step, index) => (
        <ProcessStepColumn
          key={step.id}
          step={step}
          stepIndex={index}
          active={activeIndex === index}
          onSelect={onSelect}
          circleRef={registerCircleRef(index)}
          layout="stack"
        />
      ))}
    </ol>
  );
}

export function ProcessSection() {
  const [activeIndex, setActiveIndex] = useState(1);
  const sectionRef = useRef<HTMLElement>(null);
  const pathInView = useInView(sectionRef, { once: true, amount: 0.2 });
  const reduce = useReducedMotion();

  const handleSelect = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    if (reduce || !pathInView) return;

    const interval = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % steps.length);
    }, 4200);

    return () => window.clearInterval(interval);
  }, [pathInView, reduce]);

  return (
    <section ref={sectionRef} className="apple-section bg-apple-bg-alt">
      <div className="apple-section-content max-w-[1120px]">
        <ScrollReveal>
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-apple-text-secondary">
              Step by step process
            </p>
            <h2 className="apple-section-headline mt-3 text-left text-apple-text">
              We complete every{" "}
              <span className="font-bold text-[color:var(--nexus-approval)]">
                step
              </span>{" "}
              with care.
            </h2>
            <p className="apple-body mt-4 max-w-2xl text-left">
              A six-step protocol to reclaim your time and revenue — from first
              signal to saved deals in your Command Center.
            </p>
          </div>
        </ScrollReveal>

        <div className="hidden md:block">
          <ProcessSnakeDesktop
            activeIndex={activeIndex}
            onSelect={handleSelect}
            pathInView={pathInView}
          />
        </div>

        <ProcessSnakeMobile
          activeIndex={activeIndex}
          onSelect={handleSelect}
          pathInView={pathInView}
        />
      </div>
    </section>
  );
}
