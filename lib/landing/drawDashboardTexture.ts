const WIDTH = 2560;
const HEIGHT = 1600;

// Layout constants (canvas px). Tune density here, not inline.
const CHROME_H = 76;
const SIDEBAR_W = 380;
const CONTENT_PAD = 64;
const CARD_RADIUS = 24;
const HAIRLINE = "rgba(255,255,255,0.08)";
const HAIRLINE_SOFT = "rgba(255,255,255,0.05)";
const BG = "#101012";
const PANEL_TOP = "#1a1a1d";
const PANEL_BOTTOM = "#151517";
const ACCENT_SOFT = "#5ea0ff";
const EMERALD = "#34d399";

const FONT_STACK = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

const metrics = [
  { label: "Revenue at Risk", value: "$48,200", delta: "+$6.4K", deltaTone: "risk", spark: [30, 26, 34, 31, 40, 38, 47, 52], sparkColor: "#f87171" },
  { label: "Hot Leads", value: "12", delta: "+3", deltaTone: "good", spark: [4, 6, 5, 8, 7, 9, 11, 12], sparkColor: "#5ea0ff" },
  { label: "Churn Risks", value: "5", delta: "−2", deltaTone: "good", spark: [9, 8, 9, 7, 8, 6, 6, 5], sparkColor: "#fbbf24" },
  { label: "Hours Saved", value: "14.2h", delta: "+2.1h", deltaTone: "good", spark: [6, 7, 9, 8, 11, 12, 13, 14.2], sparkColor: "#34d399" },
] as const;

const feed = [
  { name: "Sarah Chen", initials: "SC", hue: [214, 262], preview: "We need to upgrade before Q3 - can you send pricing?", urgency: "Critical", value: "$24,000" },
  { name: "Marcus Webb", initials: "MW", hue: [24, 4], preview: "Invoice discrepancy on last month's subscription", urgency: "High", value: "$8,400" },
  { name: "Priya Nair", initials: "PN", hue: [158, 190], preview: "Love the onboarding - team wants to expand seats", urgency: "High", value: "$12,500" },
  { name: "Emma Rodriguez", initials: "ER", hue: [286, 320], preview: "Customer left a five-star WhatsApp review", urgency: "Positive", value: "$4,900" },
  { name: "Jordan Lee", initials: "JL", hue: [196, 226], preview: "LinkedIn partnership message needs founder reply", urgency: "Medium", value: "$6,200" },
] as const;

const URGENCY_STYLE: Record<string, { fill: string; text: string }> = {
  Critical: { fill: "rgba(239,68,68,0.14)", text: "#f87171" },
  High: { fill: "rgba(245,158,11,0.14)", text: "#fbbf24" },
  Medium: { fill: "rgba(96,165,250,0.14)", text: "#93c5fd" },
  Positive: { fill: "rgba(52,211,153,0.14)", text: "#6ee7b7" },
};

type NavItem = { label: string; active?: boolean; badge?: string };

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", active: true },
  { label: "Inbox", badge: "24" },
  { label: "Approvals", badge: "6" },
  { label: "Leads" },
  { label: "Reports" },
  { label: "Settings" },
];

// Revenue-rescued chart, values in $K per week.
const CHART_POINTS = [12, 16, 14, 22, 19, 26, 31, 29, 38, 42, 40, 48.2];

type Ctx = CanvasRenderingContext2D & { letterSpacing?: string };

function setTracking(ctx: Ctx, value: string) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = value;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Card surface: soft vertical gradient fill + 1px hairline. */
function panel(ctx: Ctx, x: number, y: number, w: number, h: number, r = CARD_RADIUS) {
  const fill = ctx.createLinearGradient(0, y, 0, y + h);
  fill.addColorStop(0, PANEL_TOP);
  fill.addColorStop(1, PANEL_BOTTOM);
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function pill(ctx: Ctx, x: number, y: number, text: string, fill: string, color: string, size = 22) {
  ctx.font = `500 ${size}px ${FONT_STACK}`;
  const w = ctx.measureText(text).width + 34;
  const h = size + 18;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 17, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

function sparkline(ctx: Ctx, x: number, y: number, w: number, h: number, points: readonly number[], color: string) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const px = (i: number) => x + (i / (points.length - 1)) * w;
  const py = (v: number) => y + h - ((v - min) / range) * h;

  ctx.beginPath();
  points.forEach((v, i) => {
    if (i === 0) ctx.moveTo(px(i), py(v));
    else {
      const mx = (px(i - 1) + px(i)) / 2;
      ctx.quadraticCurveTo(mx, py(points[i - 1]), px(i), py(v));
    }
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawChrome(ctx: Ctx) {
  // Traffic lights
  const lights = ["#ff5f57", "#febc2e", "#28c840"];
  lights.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(52 + i * 40, CHROME_H / 2, 11, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });

  // Left-aligned beside the traffic lights: the MacBook's camera notch
  // occludes the top-center of the display, exactly like real macOS.
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `500 26px ${FONT_STACK}`;
  ctx.fillText("Nexus OS — Command Center", 176, CHROME_H / 2 + 9);

  // Search pill
  const sw = 360;
  const sx = WIDTH - sw - 40;
  roundRect(ctx, sx, 16, sw, CHROME_H - 32, (CHROME_H - 32) / 2);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fill();
  ctx.strokeStyle = HAIRLINE_SOFT;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx + 34, CHROME_H / 2 - 3, 8, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx + 40, CHROME_H / 2 + 4);
  ctx.lineTo(sx + 47, CHROME_H / 2 + 11);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.font = `400 24px ${FONT_STACK}`;
  ctx.fillText("Search", sx + 62, CHROME_H / 2 + 8);

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, CHROME_H + 0.5);
  ctx.lineTo(WIDTH, CHROME_H + 0.5);
  ctx.stroke();
}

function drawNavGlyph(ctx: Ctx, index: number, x: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const s = 26;
  switch (index) {
    case 0: // dashboard: 2x2 grid
      for (const [gx, gy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        roundRect(ctx, x + gx * (s / 2 + 4), y + gy * (s / 2 + 4), s / 2, s / 2, 4);
        ctx.stroke();
      }
      break;
    case 1: // inbox: tray
      ctx.beginPath();
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x + s, y + s);
      ctx.lineTo(x + s, y + 4);
      ctx.moveTo(x, y + s - 10);
      ctx.lineTo(x + 8, y + s - 10);
      ctx.lineTo(x + 12, y + s - 4);
      ctx.lineTo(x + s - 12, y + s - 4);
      ctx.lineTo(x + s - 8, y + s - 10);
      ctx.lineTo(x + s, y + s - 10);
      ctx.stroke();
      break;
    case 2: // approvals: circle + check
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + s / 2 - 6, y + s / 2);
      ctx.lineTo(x + s / 2 - 1, y + s / 2 + 5);
      ctx.lineTo(x + s / 2 + 7, y + s / 2 - 5);
      ctx.stroke();
      break;
    case 3: // leads: ascending bars
      for (const [i, h] of [10, 17, 26].entries()) {
        ctx.beginPath();
        ctx.moveTo(x + 3 + i * 10, y + s);
        ctx.lineTo(x + 3 + i * 10, y + s - h);
        ctx.stroke();
      }
      break;
    case 4: // reports: document
      roundRect(ctx, x + 2, y, s - 4, s, 4);
      ctx.stroke();
      for (const ly of [9, 15, 21]) {
        ctx.beginPath();
        ctx.moveTo(x + 8, y + ly);
        ctx.lineTo(x + s - 8, y + ly);
        ctx.stroke();
      }
      break;
    default: // settings: ring + dot
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, s / 2 - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + s / 2, y + s / 2, 4, 0, Math.PI * 2);
      ctx.fill();
  }
}

function drawSidebar(ctx: Ctx) {
  ctx.fillStyle = "#121214";
  ctx.fillRect(0, CHROME_H, SIDEBAR_W, HEIGHT - CHROME_H);
  ctx.strokeStyle = HAIRLINE_SOFT;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(SIDEBAR_W + 0.5, CHROME_H);
  ctx.lineTo(SIDEBAR_W + 0.5, HEIGHT);
  ctx.stroke();

  let y = CHROME_H + 72;
  NAV_ITEMS.forEach((item, i) => {
    const rowH = 76;
    if (item.active) {
      roundRect(ctx, 24, y - 20, SIDEBAR_W - 48, 64, 16);
      ctx.fillStyle = "rgba(18,116,249,0.14)";
      ctx.fill();
    }
    const color = item.active ? "#dbe8ff" : "rgba(255,255,255,0.5)";
    drawNavGlyph(ctx, i, 52, y - 2, item.active ? ACCENT_SOFT : "rgba(255,255,255,0.42)");
    ctx.fillStyle = color;
    ctx.font = `${item.active ? 600 : 500} 28px ${FONT_STACK}`;
    ctx.fillText(item.label, 108, y + 20);

    if ("badge" in item && item.badge) {
      ctx.font = `600 21px ${FONT_STACK}`;
      const bw = ctx.measureText(item.badge).width + 24;
      roundRect(ctx, SIDEBAR_W - 40 - bw, y - 4, bw, 34, 17);
      ctx.fillStyle = i === 2 ? "rgba(18,116,249,0.2)" : "rgba(255,255,255,0.08)";
      ctx.fill();
      ctx.fillStyle = i === 2 ? ACCENT_SOFT : "rgba(255,255,255,0.55)";
      ctx.fillText(item.badge, SIDEBAR_W - 40 - bw + 12, y + 20);
    }
    y += rowH;
  });

  // User row pinned to bottom
  const uy = HEIGHT - 96;
  ctx.strokeStyle = HAIRLINE_SOFT;
  ctx.beginPath();
  ctx.moveTo(24, uy - 32);
  ctx.lineTo(SIDEBAR_W - 24, uy - 32);
  ctx.stroke();
  const av = ctx.createLinearGradient(44, uy - 8, 100, uy + 48);
  av.addColorStop(0, "hsl(214, 80%, 55%)");
  av.addColorStop(1, "hsl(262, 70%, 55%)");
  ctx.beginPath();
  ctx.arc(72, uy + 20, 28, 0, Math.PI * 2);
  ctx.fillStyle = av;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 22px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.fillText("SD", 72, uy + 28);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `600 26px ${FONT_STACK}`;
  ctx.fillText("Senuka D.", 116, uy + 14);
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = `400 22px ${FONT_STACK}`;
  ctx.fillText("Founder", 116, uy + 44);
}

function drawHeader(ctx: Ctx, x: number, w: number) {
  const y = CHROME_H + 88;
  ctx.fillStyle = ACCENT_SOFT;
  ctx.font = `600 24px ${FONT_STACK}`;
  setTracking(ctx, "4px");
  ctx.fillText("OPERATIONS", x, y);
  setTracking(ctx, "0px");

  ctx.fillStyle = "#f5f5f7";
  ctx.font = `650 76px ${FONT_STACK}`;
  setTracking(ctx, "-1.5px");
  ctx.fillText("Command Center", x, y + 92);
  setTracking(ctx, "0px");

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `400 32px ${FONT_STACK}`;
  ctx.fillText("Live revenue rescue across every customer channel.", x, y + 148);

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `400 28px ${FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.fillText("Today · Wed 9 Jul", x + w, y + 4);
  ctx.textAlign = "left";

  return y + 200;
}

function drawMetricCards(ctx: Ctx, x: number, w: number, y: number) {
  const gap = 32;
  const cardW = (w - gap * 3) / 4;
  const cardH = 240;

  metrics.forEach((m, i) => {
    const cx = x + i * (cardW + gap);
    panel(ctx, cx, y, cardW, cardH);

    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = `500 27px ${FONT_STACK}`;
    ctx.fillText(m.label, cx + 36, y + 62);

    ctx.fillStyle = "#f5f5f7";
    ctx.font = `600 58px ${FONT_STACK}`;
    setTracking(ctx, "-0.5px");
    ctx.fillText(m.value, cx + 36, y + 132);
    setTracking(ctx, "0px");

    const good = m.deltaTone === "good";
    const valueW = ctx.measureText(m.value).width;
    pill(
      ctx,
      cx + 36 + valueW + 20,
      y + 96,
      m.delta,
      good ? "rgba(52,211,153,0.12)" : "rgba(239,68,68,0.12)",
      good ? EMERALD : "#f87171",
    );

    sparkline(ctx, cx + 36, y + 168, cardW - 72, 44, m.spark, m.sparkColor);
  });

  return y + cardH;
}

function drawChart(ctx: Ctx, x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  const pad = 44;

  ctx.fillStyle = "#f5f5f7";
  ctx.font = `600 32px ${FONT_STACK}`;
  ctx.fillText("Revenue rescued", x + pad, y + 68);

  // Period pills, right-aligned
  const periods = ["7D", "30D", "90D"];
  let px = x + w - pad;
  for (let i = periods.length - 1; i >= 0; i -= 1) {
    ctx.font = `500 22px ${FONT_STACK}`;
    const pw = ctx.measureText(periods[i]).width + 34;
    px -= pw + (i < periods.length - 1 ? 12 : 0);
    const active = periods[i] === "30D";
    roundRect(ctx, px, y + 40, pw, 40, 20);
    ctx.fillStyle = active ? "rgba(18,116,249,0.2)" : "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.fillStyle = active ? ACCENT_SOFT : "rgba(255,255,255,0.4)";
    ctx.textBaseline = "middle";
    ctx.fillText(periods[i], px + 17, y + 61);
    ctx.textBaseline = "alphabetic";
  }

  const plotX = x + pad + 84;
  const plotY = y + 128;
  const plotW = w - pad * 2 - 84;
  const plotH = h - 128 - 88;
  const maxV = 60;

  // Gridlines + y labels
  for (let i = 0; i <= 3; i += 1) {
    const gy = plotY + (i / 3) * plotH;
    ctx.strokeStyle = HAIRLINE_SOFT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotX, gy + 0.5);
    ctx.lineTo(plotX + plotW, gy + 0.5);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = `400 22px ${FONT_STACK}`;
    ctx.textAlign = "right";
    ctx.fillText(`$${Math.round(maxV - (i / 3) * maxV)}K`, plotX - 20, gy + 8);
    ctx.textAlign = "left";
  }

  const ptX = (i: number) => plotX + (i / (CHART_POINTS.length - 1)) * plotW;
  const ptY = (v: number) => plotY + plotH - (v / maxV) * plotH;

  const tracePath = () => {
    ctx.beginPath();
    CHART_POINTS.forEach((v, i) => {
      if (i === 0) ctx.moveTo(ptX(i), ptY(v));
      else {
        const mx = (ptX(i - 1) + ptX(i)) / 2;
        ctx.bezierCurveTo(mx, ptY(CHART_POINTS[i - 1]), mx, ptY(v), ptX(i), ptY(v));
      }
    });
  };

  // Area fill
  tracePath();
  ctx.lineTo(ptX(CHART_POINTS.length - 1), plotY + plotH);
  ctx.lineTo(plotX, plotY + plotH);
  ctx.closePath();
  const area = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
  area.addColorStop(0, "rgba(18,116,249,0.26)");
  area.addColorStop(1, "rgba(18,116,249,0)");
  ctx.fillStyle = area;
  ctx.fill();

  // Line
  tracePath();
  ctx.strokeStyle = "#4f8ef7";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  // End point + tooltip
  const ex = ptX(CHART_POINTS.length - 1);
  const ey = ptY(CHART_POINTS[CHART_POINTS.length - 1]);
  ctx.beginPath();
  ctx.arc(ex, ey, 14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(79,142,247,0.25)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ex, ey, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  ctx.font = `600 24px ${FONT_STACK}`;
  const tip = "$48.2K rescued";
  const tw = ctx.measureText(tip).width + 40;
  const tx = Math.min(ex - tw / 2, x + w - pad - tw);
  roundRect(ctx, tx, ey - 76, tw, 48, 12);
  ctx.fillStyle = "#1d1d21";
  ctx.fill();
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#f5f5f7";
  ctx.fillText(tip, tx + 20, ey - 44);
}

function drawInbox(ctx: Ctx, x: number, y: number, w: number, h: number) {
  panel(ctx, x, y, w, h);
  const pad = 40;

  ctx.fillStyle = "#f5f5f7";
  ctx.font = `600 32px ${FONT_STACK}`;
  ctx.fillText("Inbox feed", x + pad, y + 66);

  // Live indicator
  ctx.beginPath();
  ctx.arc(x + w - pad - 70, y + 56, 6, 0, Math.PI * 2);
  ctx.fillStyle = EMERALD;
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `600 22px ${FONT_STACK}`;
  setTracking(ctx, "2px");
  ctx.fillText("LIVE", x + w - pad - 52, y + 64);
  setTracking(ctx, "0px");

  const rowH = (h - 108) / feed.length;
  feed.forEach((row, i) => {
    const ry = y + 100 + i * rowH;
    const cy = ry + rowH / 2;

    // Avatar
    const av = ctx.createLinearGradient(x + pad, cy - 30, x + pad + 60, cy + 30);
    av.addColorStop(0, `hsl(${row.hue[0]}, 72%, 56%)`);
    av.addColorStop(1, `hsl(${row.hue[1]}, 64%, 46%)`);
    ctx.beginPath();
    ctx.arc(x + pad + 30, cy, 30, 0, Math.PI * 2);
    ctx.fillStyle = av;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 23px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(row.initials, x + pad + 30, cy + 8);
    ctx.textAlign = "left";

    const textX = x + pad + 84;
    const rightX = x + w - pad;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `600 28px ${FONT_STACK}`;
    ctx.fillText(row.name, textX, cy - 8);

    ctx.fillStyle = "rgba(255,255,255,0.42)";
    ctx.font = `400 24px ${FONT_STACK}`;
    const maxPreview = rightX - textX - 220;
    let preview: string = row.preview;
    while (ctx.measureText(preview).width > maxPreview && preview.length > 4) {
      preview = preview.slice(0, -1);
    }
    if (preview !== row.preview) preview = `${preview.trimEnd()}…`;
    ctx.fillText(preview, textX, cy + 28);

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = `600 27px ${FONT_STACK}`;
    ctx.textAlign = "right";
    ctx.fillText(row.value, rightX, cy - 8);
    ctx.textAlign = "left";

    const style = URGENCY_STYLE[row.urgency];
    ctx.font = `500 20px ${FONT_STACK}`;
    const bw = ctx.measureText(row.urgency.toUpperCase()).width + 34;
    pill(ctx, rightX - bw, cy + 6, row.urgency.toUpperCase(), style.fill, style.text, 20);

    if (i < feed.length - 1) {
      ctx.strokeStyle = HAIRLINE_SOFT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(textX, ry + rowH + 0.5);
      ctx.lineTo(rightX, ry + rowH + 0.5);
      ctx.stroke();
    }
  });
}

function drawFinish(ctx: Ctx) {
  // Vignette: darken corners slightly so the screen reads as glass, not a flat print
  const vignette = ctx.createRadialGradient(
    WIDTH / 2,
    HEIGHT / 2,
    HEIGHT * 0.45,
    WIDTH / 2,
    HEIGHT / 2,
    WIDTH * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.16)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Faint top-edge sheen
  const sheen = ctx.createLinearGradient(0, 0, 0, 150);
  sheen.addColorStop(0, "rgba(255,255,255,0.045)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, WIDTH, 150);
}

/** Paints the Nexus OS Command Center UI onto a canvas for MacBook screen texture. */
export function drawDashboardTexture(
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d") as Ctx | null;
  if (!ctx) return canvas;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Soft ambient accent glow behind the content area
  const glow = ctx.createRadialGradient(WIDTH * 0.68, HEIGHT * 0.1, 100, WIDTH * 0.68, HEIGHT * 0.1, 1100);
  glow.addColorStop(0, "rgba(18,116,249,0.1)");
  glow.addColorStop(0.5, "rgba(18,116,249,0.03)");
  glow.addColorStop(1, "rgba(18,116,249,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  drawChrome(ctx);
  drawSidebar(ctx);

  const contentX = SIDEBAR_W + CONTENT_PAD;
  const contentW = WIDTH - contentX - CONTENT_PAD;

  const afterHeader = drawHeader(ctx, contentX, contentW);
  const afterCards = drawMetricCards(ctx, contentX, contentW, afterHeader);

  const panelY = afterCards + 40;
  const panelH = HEIGHT - panelY - CONTENT_PAD;
  const gap = 32;
  const chartW = Math.round((contentW - gap) * 0.56);
  drawChart(ctx, contentX, panelY, chartW, panelH);
  drawInbox(ctx, contentX + chartW + gap, panelY, contentW - chartW - gap, panelH);

  drawFinish(ctx);

  return canvas;
}

export const DASHBOARD_TEXTURE_SIZE = { width: WIDTH, height: HEIGHT };
