"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ACCENT_VAR, type NexusAccent } from "@/lib/landing/content";
import { EASE } from "@/lib/landing/motion";

/**
 * One small line diagram per protocol step. Each draws itself when its step
 * becomes active — the stroke is the explanation, not decoration.
 *
 * All six share a 320×200 viewBox and the same hairline vocabulary so they read
 * as a set rather than six illustrations.
 */

const HAIR = "rgba(0,0,0,0.14)";

type DiagramProps = { active: boolean; accent: NexusAccent };

function Stroke({
  d,
  active,
  color,
  delay = 0,
  width = 1.5,
  dashed,
}: {
  d: string;
  active: boolean;
  color: string;
  delay?: number;
  width?: number;
  dashed?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dashed ? "3 4" : undefined}
      initial={reduce ? false : { pathLength: 0, opacity: 0 }}
      animate={{ pathLength: active ? 1 : 0, opacity: active ? 1 : 0 }}
      transition={
        reduce
          ? { duration: 0 }
          : {
              pathLength: { duration: 0.75, ease: EASE, delay },
              opacity: { duration: 0.2, delay },
            }
      }
    />
  );
}

function Dot({
  cx,
  cy,
  r = 4,
  fill,
  active,
  delay = 0,
}: {
  cx: number;
  cy: number;
  r?: number;
  fill: string;
  active: boolean;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      initial={reduce ? false : { scale: 0, opacity: 0 }}
      animate={{ scale: active ? 1 : 0, opacity: active ? 1 : 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.4, ease: EASE, delay }}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
    />
  );
}

/** Scoring bar. Height/y are animated here because a bar growing from its
 *  baseline is the whole point of the diagram; it is a 32px-wide rect, so the
 *  layout cost is nil. */
function Bar({
  x,
  h,
  active,
  fill,
  index,
}: {
  x: number;
  h: number;
  active: boolean;
  fill: string;
  index: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.rect
      x={x}
      width={32}
      rx={5}
      fill={fill}
      initial={reduce ? false : { height: 0, y: 170 }}
      animate={{ height: active ? h : 0, y: active ? 170 - h : 170 }}
      transition={
        reduce ? { duration: 0 } : { duration: 0.55, ease: EASE, delay: 0.08 * index }
      }
    />
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 320 200" className="h-auto w-full" aria-hidden>
      {children}
    </svg>
  );
}

/* 01 — four channels converge on one hub */
function Discovery({ active, accent }: DiagramProps) {
  const c = ACCENT_VAR[accent];
  const ys = [34, 78, 122, 166];
  return (
    <Frame>
      {ys.map((y, i) => (
        <g key={y}>
          <rect x={12} y={y - 13} width={78} height={26} rx={6} fill="none" stroke={HAIR} />
          <Stroke
            d={`M 90 ${y} C 140 ${y}, 150 100, 196 100`}
            active={active}
            color={i === 0 ? c : HAIR}
            delay={0.08 * i}
          />
        </g>
      ))}
      <rect x={198} y={76} width={104} height={48} rx={10} fill="none" stroke={c} strokeWidth={1.5} />
      <Dot cx={250} cy={100} r={5} fill={c} active={active} delay={0.5} />
    </Frame>
  );
}

/* 02 — a sieve: noise falls through, signal continues */
function Intake({ active, accent }: DiagramProps) {
  const c = ACCENT_VAR[accent];
  return (
    <Frame>
      <Stroke d="M 20 70 L 300 70" active={active} color={HAIR} />
      {/* the gate itself */}
      <Stroke d="M 120 44 L 120 96" active={active} color={c} delay={0.12} width={2} />
      <text
        x={120}
        y={34}
        textAnchor="middle"
        className="font-mono"
        fontSize={9}
        letterSpacing="0.12em"
        fill={c}
      >
        FILTER
      </text>
      {/* arriving, unsorted */}
      {[36, 62, 88].map((x, i) => (
        <Dot key={x} cx={x} cy={70} r={4} fill="#c7c7cc" active={active} delay={0.2 + i * 0.06} />
      ))}
      {/* survivors carry on down the line */}
      {[164, 208, 252].map((x, i) => (
        <Dot key={x} cx={x} cy={70} r={4} fill={c} active={active} delay={0.5 + i * 0.07} />
      ))}
      {/* noise falls away below it */}
      <Stroke d="M 120 104 C 120 128, 108 132, 104 152" active={active} color={HAIR} delay={0.42} dashed />
      <Stroke d="M 120 104 C 120 132, 140 138, 148 158" active={active} color={HAIR} delay={0.5} dashed />
      <Dot cx={104} cy={152} r={3.5} fill="#dcdce0" active={active} delay={0.72} />
      <Dot cx={148} cy={158} r={3.5} fill="#dcdce0" active={active} delay={0.8} />
      <text
        x={126}
        y={186}
        textAnchor="middle"
        className="font-mono"
        fontSize={9}
        letterSpacing="0.12em"
        fill="#b0b0b5"
      >
        DROPPED
      </text>
    </Frame>
  );
}

/* 03 — scoring: four messages, one clearly outranks the rest */
function Rescue({ active, accent }: DiagramProps) {
  const c = ACCENT_VAR[accent];
  const bars = [
    { x: 40, h: 44 },
    { x: 110, h: 116 },
    { x: 180, h: 66 },
    { x: 250, h: 30 },
  ];
  return (
    <Frame>
      <Stroke d="M 20 170 L 300 170" active={active} color={HAIR} />
      {bars.map((b, i) => (
        <Bar key={b.x} x={b.x} h={b.h} active={active} fill={i === 1 ? c : "#e8e8ec"} index={i} />
      ))}
      <Stroke d="M 20 54 L 300 54" active={active} color={c} delay={0.5} dashed />
      <text x={20} y={44} className="font-mono" fontSize={9} letterSpacing="0.12em" fill={c}>
        CHURN RISK
      </text>
    </Frame>
  );
}

/* 04 — the gate: a draft waits, you release it */
function Approval({ active, accent }: DiagramProps) {
  const c = ACCENT_VAR[accent];
  return (
    <Frame>
      <rect x={20} y={52} width={150} height={96} rx={10} fill="none" stroke={HAIR} />
      {[72, 88, 104].map((y, i) => (
        <Stroke
          key={y}
          d={`M 36 ${y} L ${i === 2 ? 118 : 152} ${y}`}
          active={active}
          color={HAIR}
          delay={0.06 * i}
        />
      ))}
      <text x={36} y={134} className="font-mono" fontSize={9} letterSpacing="0.12em" fill="#86868b">
        DRAFT
      </text>

      <Stroke d="M 178 100 L 214 100" active={active} color={HAIR} delay={0.3} dashed />
      <Stroke d="M 236 62 L 236 138" active={active} color={c} delay={0.38} width={2} />
      <Stroke
        d="M 226 100 l 7 8 l 14 -18"
        active={active}
        color={c}
        delay={0.6}
        width={2}
      />
      <text x={214} y={158} className="font-mono" fontSize={9} letterSpacing="0.12em" fill={c}>
        YOU
      </text>
    </Frame>
  );
}

/* 05 — approved reply goes back out on the channel it came from */
function Execution({ active, accent }: DiagramProps) {
  const c = ACCENT_VAR[accent];
  return (
    <Frame>
      <rect x={18} y={78} width={92} height={44} rx={9} fill="none" stroke={c} strokeWidth={1.5} />
      <Stroke d="M 110 100 L 196 100" active={active} color={c} delay={0.15} />
      <Stroke d="M 186 92 l 10 8 l -10 8" active={active} color={c} delay={0.42} />
      {[62, 100, 138].map((y, i) => (
        <g key={y}>
          <rect x={210} y={y - 15} width={92} height={30} rx={7} fill="none" stroke={HAIR} />
          <Dot cx={226} cy={y} r={3.5} fill={i === 1 ? c : "#c7c7cc"} active={active} delay={0.5 + i * 0.07} />
        </g>
      ))}
      <Stroke d="M 18 152 L 302 152" active={active} color={HAIR} delay={0.6} dashed />
      <text x={18} y={172} className="font-mono" fontSize={9} letterSpacing="0.12em" fill="#86868b">
        LOGGED · IDEMPOTENT
      </text>
    </Frame>
  );
}

/* 06 — the report line */
function Growth({ active, accent }: DiagramProps) {
  const c = ACCENT_VAR[accent];
  return (
    <Frame>
      {[52, 96, 140].map((y) => (
        <Stroke key={y} d={`M 20 ${y} L 300 ${y}`} active={active} color={HAIR} />
      ))}
      <Stroke
        d="M 24 156 C 70 150, 92 128, 128 118 S 196 96, 228 70 S 282 42, 298 34"
        active={active}
        color={c}
        delay={0.15}
        width={2}
      />
      <Dot cx={298} cy={34} r={5} fill={c} active={active} delay={0.85} />
      <text x={20} y={182} className="font-mono" fontSize={9} letterSpacing="0.12em" fill="#86868b">
        BUY-BACK REPORT
      </text>
    </Frame>
  );
}

export const STEP_DIAGRAMS: Record<
  string,
  (props: DiagramProps) => JSX.Element
> = {
  discovery: Discovery,
  intake: Intake,
  rescue: Rescue,
  approval: Approval,
  execution: Execution,
  growth: Growth,
};
