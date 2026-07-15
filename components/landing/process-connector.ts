export type Point = { x: number; y: number };

export type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const fmt = (n: number) => n.toFixed(2);

const CORRIDOR_OUTSET = 20;
const CORNER_RADIUS = 14;
const CARD_CLEARANCE = 8;

export function relativeBox(node: HTMLElement, container: HTMLElement): Box {
  const cr = container.getBoundingClientRect();
  const r = node.getBoundingClientRect();
  return {
    left: r.left - cr.left,
    top: r.top - cr.top,
    right: r.right - cr.left,
    bottom: r.bottom - cr.top,
  };
}

export function circleCenter(node: HTMLElement, container: HTMLElement): Point {
  const cr = container.getBoundingClientRect();
  const r = node.getBoundingClientRect();
  return {
    x: r.left + r.width / 2 - cr.left,
    y: r.top + r.height / 2 - cr.top,
  };
}

export function circleRadius(node: HTMLElement): number {
  return node.getBoundingClientRect().width / 2;
}

/** Point on circle perimeter toward another point. */
export function edgePoint(from: Point, to: Point, radius: number): Point {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return {
    x: from.x + radius * Math.cos(angle),
    y: from.y + radius * Math.sin(angle),
  };
}

function clampCorner(r: number, legA: number, legB: number): number {
  return Math.min(r, Math.abs(legA) * 0.45, Math.abs(legB) * 0.45);
}

/** Horizontal segment between two circle edges, staying in the column gutter. */
function horizontalBridge(
  from: Point,
  to: Point,
  fromRadius: number,
  toRadius: number,
  fromBox: Box,
  toBox: Box,
): string {
  const start = edgePoint(from, to, fromRadius);
  const end = edgePoint(to, from, toRadius);
  const y = (start.y + end.y) / 2;
  const gutterStart = Math.max(start.x, fromBox.right + CARD_CLEARANCE);
  const gutterEnd = Math.min(end.x, toBox.left - CARD_CLEARANCE);

  if (gutterEnd <= gutterStart) {
    return `L ${fmt(end.x)} ${fmt(end.y)}`;
  }

  return [
    `L ${fmt(start.x)} ${fmt(y)}`,
    `L ${fmt(gutterStart)} ${fmt(y)}`,
    `L ${fmt(gutterEnd)} ${fmt(y)}`,
    `L ${fmt(end.x)} ${fmt(y)}`,
    `L ${fmt(end.x)} ${fmt(end.y)}`,
  ].join(" ");
}

/**
 * Right-side corridor from step 3 to step 4 with smooth rounded corners.
 * Keeps the vertical segment outside card copy.
 */
function corridorDrop(
  from: Point,
  to: Point,
  fromRadius: number,
  toRadius: number,
  fromBox: Box,
  toBox: Box,
): string {
  const arcX =
    Math.max(fromBox.right, toBox.right, from.x + fromRadius, to.x + toRadius) +
    CORRIDOR_OUTSET;

  const exit = edgePoint(from, { x: arcX, y: from.y }, fromRadius);
  const enter = edgePoint(to, { x: arcX, y: to.y }, toRadius);

  const r = clampCorner(
    CORNER_RADIUS,
    arcX - exit.x,
    Math.abs(to.y - from.y) / 2,
  );

  const topY = exit.y;
  const botY = enter.y;

  return [
    `L ${fmt(exit.x)} ${fmt(topY)}`,
    `L ${fmt(arcX - r)} ${fmt(topY)}`,
    `Q ${fmt(arcX)} ${fmt(topY)} ${fmt(arcX)} ${fmt(topY + r)}`,
    `L ${fmt(arcX)} ${fmt(botY - r)}`,
    `Q ${fmt(arcX)} ${fmt(botY)} ${fmt(arcX - r)} ${fmt(botY)}`,
    `L ${fmt(enter.x)} ${fmt(botY)}`,
    `L ${fmt(enter.x)} ${fmt(enter.y)}`,
  ].join(" ");
}

/**
 * Route connectors through gutters and the right-side corridor so paths never
 * cross card copy. Flow: 1→2→3, arc to 4, 4→5→6 (bottom row R→L).
 */
export function buildWorkflowPath(
  centers: Point[],
  radii: number[],
  cells: Box[],
): string {
  if (centers.length < 6 || radii.length < 6 || cells.length < 6) return "";

  const [c1, c2, c3, c4, c5, c6] = centers;
  const [r1, r2, r3, r4, r5, r6] = radii;
  const [b1, b2, b3, b4, b5, b6] = cells;

  const start = edgePoint(c1, c2, r1);

  return [
    `M ${fmt(start.x)} ${fmt(start.y)}`,
    horizontalBridge(c1, c2, r1, r2, b1, b2),
    horizontalBridge(c2, c3, r2, r3, b2, b3),
    corridorDrop(c3, c4, r3, r4, b3, b4),
    horizontalBridge(c4, c5, r4, r5, b4, b5),
    horizontalBridge(c5, c6, r5, r6, b5, b6),
  ].join(" ");
}

/** Vertical timeline path for mobile — runs in the left margin beside cards. */
export function buildVerticalWorkflowPath(
  centers: Point[],
  radii: number[],
  marginX: number,
): string {
  if (centers.length < 2) return "";

  const parts: string[] = [];

  for (let i = 0; i < centers.length; i++) {
    const c = centers[i];
    const r = radii[i] ?? 0;
    const y =
      i === 0 ? c.y - r : i === centers.length - 1 ? c.y + r : c.y;

    parts.push(
      i === 0
        ? `M ${fmt(marginX)} ${fmt(y)}`
        : `L ${fmt(marginX)} ${fmt(y)}`,
    );
  }

  return parts.join(" ");
}
