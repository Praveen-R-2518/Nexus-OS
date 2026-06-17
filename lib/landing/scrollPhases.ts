/** Normalized scroll progress p ∈ [0, 1] phase boundaries for the hero MacBook sequence. */
export const PHASES = {
  heroEnd: 0.18,
  macbookEnterStart: 0.2,
  macbookCentered: 0.42,
  macbookOpenStart: 0.46,
  macbookOpenEnd: 0.68,
  dashboardRevealEnd: 0.76,
  settleEnd: 1,
} as const;

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Map progress through [start, end] to 0–1. */
export function phaseProgress(p: number, start: number, end: number): number {
  if (end <= start) return p >= end ? 1 : 0;
  return clamp01((p - start) / (end - start));
}

/** Smoothstep easing for cinematic transitions. */
export function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hero text fades out continuously from the first pixel of scroll. */
export function computeHeroOpacity(p: number): number {
  const fadeStart = 0;
  const fadeEnd = PHASES.heroEnd;
  if (p <= fadeStart) return 1;
  if (p >= fadeEnd) return 0;
  return 1 - smoothstep(phaseProgress(p, fadeStart, fadeEnd));
}

/** Hero text moves up continuously from the first pixel of scroll. */
export function computeHeroTranslateY(p: number): number {
  const fadeStart = 0;
  const fadeEnd = PHASES.heroEnd;
  const t = smoothstep(phaseProgress(p, fadeStart, fadeEnd));
  return lerp(0, -96, t);
}

/** Background cross-fade as the MacBook sequence begins. */
export function computeMacbookEnter(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookEnterStart, PHASES.macbookCentered),
  );
}

/** MacBook is completely absent in the first hero viewpoint. */
export function computeMacbookVisibility(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookEnterStart, PHASES.macbookEnterStart + 0.08),
  );
}

/** MacBook rises from below the viewport into a settled lower-center position. */
export function computeMacbookRise(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookEnterStart, PHASES.macbookCentered),
  );
}

/** 0 is closed, 1 is the fully open product-view angle. */
export function computeLidOpen(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookOpenStart, PHASES.macbookOpenEnd),
  );
}

/** Screen UI glow ramps after the lid begins opening. */
export function computeDashboardReveal(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookOpenStart + 0.06, PHASES.dashboardRevealEnd),
  );
}

/** Subtle entrance yaw; settles to face camera. */
export function computeMacbookRotationY(p: number): number {
  const rise = computeMacbookRise(p);
  return lerp(0.2, 0, smoothstep(rise));
}

/** Cards reveal once the MacBook has mostly risen into place. */
export function computeCommsReveal(p: number, stagger = 0): number {
  const base = phaseProgress(
    p,
    PHASES.macbookOpenStart + 0.12,
    PHASES.dashboardRevealEnd + 0.1,
  );
  return smoothstep(clamp01(base - stagger));
}
