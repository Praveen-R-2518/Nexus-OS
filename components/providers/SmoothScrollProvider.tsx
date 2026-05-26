"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export function SmoothScrollProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;

    const root = document.documentElement;
    root.classList.add("lenis", "lenis-smooth");

    const lenis = new Lenis({
      smoothWheel: true,
      wheelMultiplier: 0.85,
      touchMultiplier: 1.35,
    });

    let rafId = 0;
    function raf(time: number) {
      lenis.raf(time);
      rafId = window.requestAnimationFrame(raf);
    }
    rafId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(rafId);
      lenis.destroy();
      root.classList.remove("lenis", "lenis-smooth");
    };
  }, []);

  return <>{children}</>;
}
