/** Normalized scroll progress p ∈ [0, 1] phase boundaries for the hero MacBook sequence. */
export const PHASES = {
  heroEnd: 0.18,
  macbookEnterStart: 0.2,
  macbookCentered: 0.36,
  macbookRotateStart: 0.38,
  macbookRotateEnd: 0.52,
  macbookOpenStart: 0.56,
  macbookOpenEnd: 0.72,
  productViewEnd: 0.84,
  dashboardRevealEnd: 0.86,
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

/** Closed device rotates from top/lid view into a screen-forward presentation angle. */
export function computeMacbookPresentation(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookRotateStart, PHASES.macbookRotateEnd),
  );
}

/** 0 is closed, 1 is the fully open product-view angle. */
export function computeLidOpen(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookOpenStart, PHASES.macbookOpenEnd),
  );
}

/** Final product-shot framing: full display, thin base lip, and centered body. */
export function computeProductView(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookOpenEnd - 0.02, PHASES.productViewEnd),
  );
}

export function computeProductViewCamera(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookRotateStart, PHASES.productViewEnd),
  );
}

/** Screen UI glow ramps after the lid begins opening. */
export function computeDashboardReveal(p: number): number {
  return smoothstep(
    phaseProgress(p, PHASES.macbookOpenStart + 0.04, PHASES.dashboardRevealEnd),
  );
}

/** Subtle entrance yaw; settles to face camera. */
export function computeMacbookRotationY(p: number): number {
  const rise = computeMacbookRise(p);
  const presentation = computeMacbookPresentation(p);
  const productView = computeProductView(p);
  const presentationYaw = lerp(lerp(0.2, 0, smoothstep(rise)), -0.02, presentation);
  return lerp(presentationYaw, 0, productView);
}

/** Pitch the whole MacBook toward the screen-forward angle; the product
 *  view ends at exactly 0 so the 90°-open screen is parallel to the viewport. */
export function computeMacbookRotationX(p: number): number {
  const presentation = computeMacbookPresentation(p);
  const productView = computeProductView(p);
  const presentationPitch = lerp(0, THREE_DEG_TO_RAD * -6, presentation);
  return lerp(presentationPitch, 0, productView);
}

export function computeMacbookScale(p: number): number {
  const rise = computeMacbookRise(p);
  const presentation = computeMacbookPresentation(p);
  const productView = computeProductView(p);
  const closedScale = lerp(0.34, 0.43, rise);
  const presentationScale = lerp(closedScale, 0.4, presentation);
  return lerp(presentationScale, 0.37, productView);
}

export function computeMacbookY(p: number): number {
  const rise = computeMacbookRise(p);
  const presentation = computeMacbookPresentation(p);
  const productView = computeProductView(p);
  const enteredY = lerp(-28, -13.1, rise);
  const rotatedY = lerp(enteredY, -13.7, presentation);
  return lerp(rotatedY, -12.15, productView);
}

export function computeMacbookZ(p: number): number {
  const rise = computeMacbookRise(p);
  const presentation = computeMacbookPresentation(p);
  const productView = computeProductView(p);
  const enteredZ = lerp(18, 20, rise);
  const rotatedZ = lerp(enteredZ, 21, presentation);
  return lerp(rotatedZ, 23.4, productView);
}

/** Cards support the final frame only after the laptop has opened. */
export function computeCommsReveal(p: number, stagger = 0): number {
  const base = phaseProgress(
    p,
    PHASES.productViewEnd + 0.02,
    PHASES.settleEnd,
  );
  return smoothstep(clamp01(base - stagger));
}

const THREE_DEG_TO_RAD = Math.PI / 180;
