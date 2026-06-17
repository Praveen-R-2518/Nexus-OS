"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { AmbientBackground } from "@/components/landing/AmbientBackground";
import { CommsCards, CommsCardsStatic } from "@/components/landing/CommsCards";
import { DashboardPreview } from "@/components/landing/DashboardPreview";
import {
  clamp01,
  computeHeroOpacity,
  computeHeroTranslateY,
  computeMacbookEnter,
  computeMacbookVisibility,
} from "@/lib/landing/scrollPhases";

const MacbookScene = dynamic(
  () =>
    import("@/components/landing/MacbookScene").then((m) => m.MacbookScene),
  { ssr: false, loading: () => <div className="h-full w-full" /> },
);

const SEQUENCE_HEIGHT_VH = 450;

function HeroIntroContent({ showCta = true }: { showCta?: boolean }) {
  return (
    <>
      <h1 className="apple-hero-headline max-w-[980px] text-apple-text">
        The revenue &amp; AI engine for modern founders.
      </h1>
      <p className="apple-body mt-6 max-w-xl text-apple-text-secondary">
        Nexus OS rescues revenue from the chaos of every channel — so you never
        choose between saving time and saving deals.
      </p>
      {showCta ? (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/signup" className="apple-btn-primary">
            Get started
          </Link>
          <Link href="/login" className="apple-btn-link">
            Sign in ›
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function HeroSequenceStatic() {
  return (
    <section className="relative bg-apple-cinematic text-white">
      <div className="relative min-h-[calc(100svh-44px)] bg-apple-bg px-4 py-24 text-apple-text">
        <AmbientBackground />
        <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-[980px] flex-col items-center justify-center text-center">
          <HeroIntroContent />
        </div>
      </div>

      <div className="bg-apple-cinematic px-4 py-20 md:px-8 md:py-28">
        <div className="mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
          <DashboardPreview />
        </div>
        <div className="mx-auto mt-12 max-w-5xl md:mt-16">
          <CommsCardsStatic />
        </div>
      </div>
    </section>
  );
}

const PROGRESS_EPSILON = 1e-4;
const PROGRESS_LERP = 0.2;

/** Scroll progress for a tall pinned section — works with Lenis and avoids useScroll ref hydration issues. */
function usePinnedScrollProgress(containerRef: React.RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0);
  const smoothedRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId = 0;

    const update = () => {
      const node = containerRef.current;
      if (!node) return;

      const total = node.offsetHeight - window.innerHeight;
      const scrolled = -node.getBoundingClientRect().top;
      const raw = total <= 0 ? 0 : clamp01(scrolled / total);

      const prev = smoothedRef.current;
      const next = prev + (raw - prev) * PROGRESS_LERP;
      smoothedRef.current = next;

      if (Math.abs(next - prev) > PROGRESS_EPSILON) {
        setProgress(next);
      }

      rafId = window.requestAnimationFrame(update);
    };

    rafId = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(rafId);
  }, [containerRef]);

  return progress;
}

function HeroSequenceAnimated() {
  const containerRef = useRef<HTMLElement>(null);
  const progress = usePinnedScrollProgress(containerRef);

  const heroOpacity = computeHeroOpacity(progress);
  const heroY = computeHeroTranslateY(progress);
  const macbookEnter = computeMacbookEnter(progress);
  const macbookVisibility = computeMacbookVisibility(progress);
  const ctaOpacity = progress < 0.1 ? 1 - progress / 0.1 : 0;

  return (
    <section
      ref={containerRef}
      className="relative"
      style={{ height: `${SEQUENCE_HEIGHT_VH}vh` }}
      aria-label="Product introduction"
    >
      <div className="sticky top-11 h-[calc(100svh-44px)] w-full overflow-hidden">
        <div
          className="absolute inset-0 bg-apple-bg"
          style={{ opacity: Math.max(0, 1 - macbookEnter * 1.15) }}
        >
          <AmbientBackground />
        </div>

        <div
          className="absolute inset-0 bg-apple-cinematic"
          style={{ opacity: Math.min(1, macbookEnter * 1.35) }}
        />

        <div
          className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-4 text-center"
          style={{
            opacity: heroOpacity,
            transform: `translateY(${heroY}px)`,
          }}
        >
          <HeroIntroContent showCta={false} />
          <div
            className="pointer-events-auto mt-10 flex flex-wrap items-center justify-center gap-4"
            style={{ opacity: ctaOpacity }}
          >
            <Link href="/signup" className="apple-btn-primary">
              Get started
            </Link>
            <Link href="/login" className="apple-btn-link">
              Sign in ›
            </Link>
          </div>
        </div>

        <div className="absolute inset-0 z-10">
          <MacbookScene
            progress={progress}
            className="h-full w-full"
            style={{ opacity: macbookVisibility }}
          />
        </div>

        <CommsCards progress={progress} className="z-30" />
      </div>
    </section>
  );
}

function useCanUse3D() {
  const [canUse, setCanUse] = useState<boolean | null>(null);

  useEffect(() => {
    const widthMq = window.matchMedia("(min-width: 1024px)");
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      setCanUse(widthMq.matches && !motionMq.matches);
    };

    update();
    widthMq.addEventListener("change", update);
    motionMq.addEventListener("change", update);
    return () => {
      widthMq.removeEventListener("change", update);
      motionMq.removeEventListener("change", update);
    };
  }, []);

  return canUse;
}

export function HeroSequence() {
  const reduceMotion = useReducedMotion();
  const canUse3D = useCanUse3D();

  if (canUse3D === null) {
    return (
      <section className="relative min-h-screen bg-apple-bg px-4 py-24 text-apple-text">
        <AmbientBackground />
        <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-[980px] flex-col items-center justify-center text-center">
          <HeroIntroContent />
        </div>
      </section>
    );
  }

  if (reduceMotion || !canUse3D) {
    return <HeroSequenceStatic />;
  }

  return <HeroSequenceAnimated />;
}
