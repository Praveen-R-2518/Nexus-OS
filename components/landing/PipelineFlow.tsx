"use client";

import { motion, useReducedMotion, useTime, useTransform } from "framer-motion";
import { ACCENT_VAR, type NexusAccent } from "@/lib/landing/content";
import { useMediaQuery } from "@/lib/landing/useMediaQuery";

/**
 * The hero's signature animation: the whole product as one calm loop.
 *
 * Messages stream in, noise is dropped at the filter, survivors are classified
 * and prioritised, then wait for your approval before they are sent. Nothing is
 * decorative — each beat maps to a real stage of the pipeline.
 *
 * Driven by a single `useTime` clock rather than per-element keyframes: one
 * chip's body, colour dot, priority tag and check mark all read the same
 * progress value, so they can never drift apart, and the whole thing updates
 * outside React's render loop.
 *
 * The coordinate system swaps horizontal → vertical below `md` instead of
 * shrinking to illegibility.
 */

const LOOP_SECONDS = 12;

type Chip = {
  id: string;
  label: string;
  channel: string;
  accent: NexusAccent;
  priority: string;
  /** Noise is dropped at the filter and never reaches classification. */
  noise?: boolean;
};

const CHIPS: Chip[] = [
  { id: "billing", label: "Billing dispute", channel: "Gmail", accent: "rescue", priority: "Critical" },
  { id: "news", label: "Weekly newsletter", channel: "Gmail", accent: "intake", priority: "", noise: true },
  { id: "upgrade", label: "Upgrade our plan?", channel: "WhatsApp", accent: "growth", priority: "High" },
  { id: "receipt", label: "Receipt #40219", channel: "Gmail", accent: "intake", priority: "", noise: true },
  { id: "api", label: "API access for us?", channel: "Instagram", accent: "discovery", priority: "New lead" },
  { id: "demo", label: "Can we book a demo?", channel: "Messenger", accent: "approval", priority: "High" },
];

type Point = { x: number; y: number };

type Layout = {
  viewBox: string;
  /** inbound, filter, classify, approve, sent */
  stops: Point[];
  spine: { from: Point; to: Point };
  /** Where dropped noise slides off to. */
  escape: Point;
  chip: { w: number; h: number };
  label: { dy: number };
  vertical: boolean;
};

const HORIZONTAL: Layout = {
  // Station spacing is set by chip width (196) — anything tighter and two
  // chips dwelling on adjacent stations would touch.
  viewBox: "0 0 1300 300",
  spine: { from: { x: 36, y: 158 }, to: { x: 1264, y: 158 } },
  stops: [
    { x: 116, y: 158 },
    { x: 396, y: 158 },
    { x: 676, y: 158 },
    { x: 956, y: 158 },
    { x: 1200, y: 158 },
  ],
  escape: { x: 396, y: 272 },
  chip: { w: 186, h: 40 },
  label: { dy: -58 },
  vertical: false,
};

const VERTICAL: Layout = {
  viewBox: "0 0 360 520",
  spine: { from: { x: 176, y: 24 }, to: { x: 176, y: 502 } },
  stops: [
    { x: 176, y: 52 },
    { x: 176, y: 168 },
    { x: 176, y: 284 },
    { x: 176, y: 400 },
    { x: 176, y: 486 },
  ],
  escape: { x: 400, y: 168 },
  chip: { w: 236, h: 44 },
  label: { dy: -34 },
  vertical: true,
};

const STATIONS = ["Inbound", "Filter", "Classify", "Approve", "Sent"] as const;

/* ------------------------------------------------------------- timeline

   The loop is a conveyor, not six independent journeys. It ticks in BEATS,
   and chip `i` always sits exactly `i` beats behind the clock — so at any
   instant every chip is in a different segment of the line and two chips can
   never occupy the same space. Each beat is half travel, half dwell.
   ---------------------------------------------------------------------- */

const BEATS = 6;
/** Fraction of a beat spent moving; the remainder is the dwell at the station. */
const TRAVEL = 0.52;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Linear ramp from `a` to `b`, clamped to 0–1. */
function ramp(v: number, a: number, b: number): number {
  if (v <= a) return 0;
  if (v >= b) return 1;
  return (v - a) / (b - a);
}

/** Station sequence a chip walks, one entry per beat boundary. */
function laneFor(chip: Chip, l: Layout): Point[] {
  const [inbound, filter, classify, approve, sent] = l.stops;
  const exit = l.vertical
    ? { x: sent.x, y: l.spine.to.y + 160 }
    : { x: l.spine.to.x + 200, y: sent.y };

  if (chip.noise) {
    // Dropped at the filter: inbound → filter → off the line, then dark.
    return [inbound, filter, l.escape, l.escape, l.escape, l.escape, inbound];
  }
  // The last hop (exit → inbound) is the invisible reset; opacity is already 0
  // by then, so the chip never streaks backwards across the line.
  return [inbound, filter, classify, approve, sent, exit, inbound];
}

/** Where a chip is at loop position `local` ∈ [0, BEATS). */
function positionAt(local: number, lane: Point[], axis: "x" | "y"): number {
  const seg = Math.min(Math.floor(local), lane.length - 2);
  const f = smoothstep(Math.min((local - seg) / TRAVEL, 1));
  return lane[seg][axis] + (lane[seg + 1][axis] - lane[seg][axis]) * f;
}

/**
 * A chip sits AT `lane[k]` from `k - 1 + TRAVEL` until `k`, then moves off.
 * Both fades are keyed to those dwell windows.
 */
function opacityAt(local: number, noise: boolean): number {
  const fadeIn = ramp(local, 0, 0.22);
  // Noise dissolves as it slides off the line after the filter (beat 1);
  // survivors dissolve on the way out after Sent (beat 4).
  const fadeOut = noise
    ? 1 - ramp(local, 1.05, 1.45)
    : 1 - ramp(local, 4.02, 4.4);
  return Math.min(fadeIn, fadeOut);
}

/* ---------------------------------------------------------------- chips */

function ChipVisual({
  chip,
  layout,
  classified,
  approved,
}: {
  chip: Chip;
  layout: Layout;
  /** MotionValue-compatible: a number for the static frame, else a MotionValue. */
  classified: React.ComponentProps<typeof motion.circle>["style"];
  approved: React.ComponentProps<typeof motion.path>["style"];
}) {
  const { w, h } = layout.chip;
  const accent = ACCENT_VAR[chip.accent];

  return (
    <>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={10}
        fill="#ffffff"
        stroke="rgba(0,0,0,0.1)"
        strokeWidth={1}
      />
      {/* Neutral dot underneath; the accent fades in on top at classification,
          so the colour change never repaints a fill mid-animation. */}
      <circle cx={-w / 2 + 18} cy={0} r={4} fill="#c7c7cc" />
      <motion.circle cx={-w / 2 + 18} cy={0} r={4} fill={accent} style={classified} />
      <text
        x={-w / 2 + 32}
        y={-4}
        className="font-sans"
        fontSize={13}
        fontWeight={500}
        fill="#1d1d1f"
        dominantBaseline="middle"
      >
        {chip.label}
      </text>
      <text
        x={-w / 2 + 32}
        y={11}
        className="font-mono"
        fontSize={9}
        fill="#86868b"
        dominantBaseline="middle"
      >
        {chip.channel}
      </text>

      {chip.noise ? null : (
        <>
          <motion.text
            x={w / 2 - 14}
            y={-4}
            textAnchor="end"
            className="font-mono"
            fontSize={9}
            fontWeight={600}
            fill={accent}
            dominantBaseline="middle"
            style={classified}
          >
            {chip.priority.toUpperCase()}
          </motion.text>
          <motion.path
            d={`M ${w / 2 - 27} 9 l 4 4 l 8 -9`}
            fill="none"
            stroke="var(--nexus-intake)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={approved}
          />
        </>
      )}
    </>
  );
}

function AnimatedChip({
  chip,
  layout,
  index,
}: {
  chip: Chip;
  layout: Layout;
  index: number;
}) {
  const time = useTime();
  const lane = laneFor(chip, layout);

  /** This chip's own position in the conveyor, in beats. */
  const local = useTransform(time, (t) => {
    const beat = (t / 1000 / LOOP_SECONDS) * BEATS;
    return ((beat - index) % BEATS + BEATS) % BEATS;
  });

  const x = useTransform(local, (v) => positionAt(v, lane, "x"));
  const y = useTransform(local, (v) => positionAt(v, lane, "y"));
  const opacity = useTransform(local, (v) => opacityAt(v, Boolean(chip.noise)));
  // Colour + priority land while the chip rests at Classify (1.52 → 2.0).
  const classified = useTransform(local, (v) =>
    chip.noise ? 0 : ramp(v, 1.62, 1.9),
  );
  // The check strokes in while it waits at Approve (2.52 → 3.0) — the beat
  // where a real reply would be sitting in your queue.
  const approved = useTransform(local, (v) =>
    chip.noise ? 0 : ramp(v, 2.62, 2.9),
  );

  return (
    <motion.g style={{ x, y, opacity }}>
      <ChipVisual
        chip={chip}
        layout={layout}
        classified={{ opacity: classified }}
        approved={{ opacity: approved, pathLength: approved }}
      />
    </motion.g>
  );
}

/**
 * Reduced motion gets a composed frame instead of nothing: one chip parked at
 * every station, plus one already dropped, so the diagram still explains the
 * pipeline end to end. `-1` means "off the line".
 */
const STATIC_SLOTS = [0, -1, 2, 1, 3, 4];

function StaticChip({
  chip,
  layout,
  index,
}: {
  chip: Chip;
  layout: Layout;
  index: number;
}) {
  const slot = STATIC_SLOTS[index];
  const at = slot < 0 ? layout.escape : layout.stops[slot];

  return (
    <g transform={`translate(${at.x} ${at.y})`} opacity={slot < 0 ? 0.45 : 1}>
      <ChipVisual
        chip={chip}
        layout={layout}
        classified={{ opacity: slot >= 2 ? 1 : 0 }}
        approved={{ opacity: slot >= 3 ? 1 : 0, pathLength: 1 }}
      />
    </g>
  );
}

/* ------------------------------------------------------------- stations */

function Station({ index, layout }: { index: number; layout: Layout }) {
  const stop = layout.stops[index];
  const isApproval = index === 3;

  return (
    <g>
      <circle
        cx={stop.x}
        cy={stop.y}
        r={5}
        fill="#ffffff"
        stroke={isApproval ? "var(--nexus-approval)" : "rgba(0,0,0,0.18)"}
        strokeWidth={isApproval ? 2 : 1}
      />
      <text
        x={stop.x}
        y={stop.y + layout.label.dy}
        textAnchor="middle"
        className="font-mono"
        fontSize={10}
        fontWeight={500}
        letterSpacing="0.14em"
        fill={isApproval ? "var(--nexus-approval)" : "#86868b"}
      >
        {STATIONS[index].toUpperCase()}
      </text>
    </g>
  );
}

/** A slow carrier pulse so the line still reads as live during the dwells. */
function Pulse({ layout }: { layout: Layout }) {
  const time = useTime();
  const progress = useTransform(time, (t) => ((t / 1000) % 7) / 7);
  const cx = useTransform(
    progress,
    (p) => layout.spine.from.x + (layout.spine.to.x - layout.spine.from.x) * p,
  );
  const cy = useTransform(
    progress,
    (p) => layout.spine.from.y + (layout.spine.to.y - layout.spine.from.y) * p,
  );
  const opacity = useTransform(
    progress,
    (p) => 0.32 * ramp(p, 0, 0.08) * (1 - ramp(p, 0.9, 1)),
  );

  return <motion.circle r={2.5} fill="var(--nexus-approval)" style={{ cx, cy, opacity }} />;
}

/* ------------------------------------------------------------------ svg */

export function PipelineFlow({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Render the horizontal frame during SSR/first paint; it is the common case,
  // and swapping once on mount beats guessing wrong on every device.
  const layout = isDesktop === false ? VERTICAL : HORIZONTAL;

  return (
    <div className={className}>
      <svg
        viewBox={layout.viewBox}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label="Messages arrive from every channel; noise is filtered out, the rest are classified, approved by you, then sent."
      >
        <line
          x1={layout.spine.from.x}
          y1={layout.spine.from.y}
          x2={layout.spine.to.x}
          y2={layout.spine.to.y}
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={1}
        />

        <line
          x1={layout.stops[1].x}
          y1={layout.stops[1].y}
          x2={layout.escape.x}
          y2={layout.escape.y}
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
        <text
          x={layout.vertical ? layout.escape.x - 6 : layout.escape.x}
          y={layout.escape.y + (layout.vertical ? 30 : 32)}
          textAnchor={layout.vertical ? "end" : "middle"}
          className="font-mono"
          fontSize={10}
          letterSpacing="0.12em"
          fill="#b0b0b5"
        >
          NOISE DROPPED
        </text>

        {STATIONS.map((name, i) => (
          <Station key={name} index={i} layout={layout} />
        ))}

        {reduce ? null : <Pulse layout={layout} />}

        {CHIPS.map((chip, i) =>
          reduce ? (
            <StaticChip key={chip.id} chip={chip} layout={layout} index={i} />
          ) : (
            <AnimatedChip key={chip.id} chip={chip} layout={layout} index={i} />
          ),
        )}
      </svg>
    </div>
  );
}
