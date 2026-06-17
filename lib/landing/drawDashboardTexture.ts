const WIDTH = 1024;
const HEIGHT = 640;

const metrics = [
  { label: "Revenue at Risk", value: "$48,200" },
  { label: "Hot Leads", value: "12" },
  { label: "Churn Risks", value: "5" },
  { label: "Hours Saved", value: "14.2h" },
] as const;

const feed = [
  {
    name: "Sarah Chen",
    preview: "We need to upgrade before Q3 — can you send pricing?",
    urgency: "Critical",
    value: "$24,000",
  },
  {
    name: "Marcus Webb",
    preview: "Invoice discrepancy on last month's subscription",
    urgency: "High",
    value: "$8,400",
  },
  {
    name: "Priya Nair",
    preview: "Love the onboarding — team wants to expand seats",
    urgency: "High",
    value: "$12,500",
  },
] as const;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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

/** Paints the Nexus OS Command Center UI onto a canvas for MacBook screen texture. */
export function drawDashboardTexture(
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = "#8fbce6";
  ctx.font = "bold 18px system-ui, -apple-system, sans-serif";
  ctx.fillText("OPERATIONS", 32, 48);

  ctx.fillStyle = "#ffffff";
  ctx.font = "600 42px system-ui, -apple-system, sans-serif";
  ctx.fillText("Command Center", 32, 96);

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 118);
  ctx.lineTo(WIDTH, 118);
  ctx.stroke();

  // Metric tiles (2x2)
  const tileW = (WIDTH - 32 * 2 - 16) / 2;
  const tileH = 88;
  const startY = 136;

  metrics.forEach((m, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 32 + col * (tileW + 16);
    const y = startY + row * (tileH + 16);

    roundRect(ctx, x, y, tileW, tileH, 12);
    ctx.fillStyle = "#161616";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "500 16px system-ui, -apple-system, sans-serif";
    ctx.fillText(m.label, x + 16, y + 32);

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 28px system-ui, -apple-system, sans-serif";
    ctx.fillText(m.value, x + 16, y + 68);
  });

  // Inbox feed panel
  const panelY = startY + 2 * (tileH + 16) + 8;
  const panelH = HEIGHT - panelY - 24;

  roundRect(ctx, 32, panelY, WIDTH - 64, panelH, 12);
  ctx.fillStyle = "#161616";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 14px system-ui, -apple-system, sans-serif";
  ctx.fillText("INBOX FEED", 48, panelY + 32);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(48, panelY + 44);
  ctx.lineTo(WIDTH - 48, panelY + 44);
  ctx.stroke();

  feed.forEach((row, i) => {
    const rowY = panelY + 56 + i * 72;

    // Urgency badge
    roundRect(ctx, 48, rowY, 72, 22, 4);
    ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(239, 68, 68, 0.35)";
    ctx.stroke();
    ctx.fillStyle = "#fca5a5";
    ctx.font = "bold 11px ui-monospace, monospace";
    ctx.fillText(row.urgency.toUpperCase(), 56, rowY + 15);

    ctx.fillStyle = "#ffffff";
    ctx.font = "600 18px system-ui, -apple-system, sans-serif";
    ctx.fillText(row.name, 132, rowY + 18);

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "400 14px system-ui, -apple-system, sans-serif";
    const preview =
      row.preview.length > 52 ? `${row.preview.slice(0, 52)}…` : row.preview;
    ctx.fillText(preview, 132, rowY + 40);

    ctx.fillStyle = "#34d399";
    ctx.font = "600 16px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(row.value, WIDTH - 48, rowY + 28);
    ctx.textAlign = "left";

    if (i < feed.length - 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(48, rowY + 56);
      ctx.lineTo(WIDTH - 48, rowY + 56);
      ctx.stroke();
    }
  });

  return canvas;
}

export const DASHBOARD_TEXTURE_SIZE = { width: WIDTH, height: HEIGHT };
