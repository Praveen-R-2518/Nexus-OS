const WIDTH = 2048;
const HEIGHT = 1280;

const metrics = [
  { label: "Revenue at Risk", value: "$48,200" },
  { label: "Hot Leads", value: "12" },
  { label: "Churn Risks", value: "5" },
  { label: "Hours Saved", value: "14.2h" },
] as const;

const feed = [
  {
    name: "Sarah Chen",
    preview: "We need to upgrade before Q3 - can you send pricing?",
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
    preview: "Love the onboarding - team wants to expand seats",
    urgency: "High",
    value: "$12,500",
  },
  {
    name: "Emma Rodriguez",
    preview: "Customer left a five-star WhatsApp review",
    urgency: "Positive",
    value: "$4,900",
  },
  {
    name: "Jordan Lee",
    preview: "LinkedIn partnership message needs founder reply",
    urgency: "Medium",
    value: "$6,200",
  },
  {
    name: "Atlas Ops",
    preview: "Regional routing question from pricing page",
    urgency: "High",
    value: "$18,000",
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

  const pageX = 80;
  const pageY = 72;
  const pageW = WIDTH - pageX * 2;

  const gradient = ctx.createRadialGradient(
    WIDTH * 0.7,
    HEIGHT * 0.12,
    120,
    WIDTH * 0.7,
    HEIGHT * 0.12,
    980,
  );
  gradient.addColorStop(0, "rgba(41, 151, 255, 0.16)");
  gradient.addColorStop(0.5, "rgba(41, 151, 255, 0.04)");
  gradient.addColorStop(1, "rgba(41, 151, 255, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#8fbce6";
  ctx.font = "bold 34px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("OPERATIONS", pageX, pageY);

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 92px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("Command Center", pageX, pageY + 104);

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "400 30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText(
    "Live revenue rescue across every customer channel.",
    pageX,
    pageY + 156,
  );

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pageX, pageY + 204);
  ctx.lineTo(WIDTH - pageX, pageY + 204);
  ctx.stroke();

  const tileGap = 28;
  const tileW = (pageW - tileGap * 3) / 4;
  const tileH = 176;
  const startY = pageY + 252;

  metrics.forEach((m, i) => {
    const x = pageX + i * (tileW + tileGap);
    const y = startY;

    roundRect(ctx, x, y, tileW, tileH, 24);
    ctx.fillStyle = "#161616";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "600 25px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(m.label, x + 28, y + 54);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 58px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(m.value, x + 28, y + 128);
  });

  const panelY = startY + tileH + 44;
  const panelH = HEIGHT - panelY - 76;

  roundRect(ctx, pageX, panelY, pageW, panelH, 26);
  ctx.fillStyle = "#161616";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillText("INBOX FEED", pageX + 34, panelY + 54);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath();
  ctx.moveTo(pageX + 34, panelY + 78);
  ctx.lineTo(WIDTH - pageX - 34, panelY + 78);
  ctx.stroke();

  feed.forEach((row, i) => {
    const rowY = panelY + 104 + i * 92;
    const badgeW = row.urgency === "Positive" ? 130 : 112;

    roundRect(ctx, pageX + 34, rowY, badgeW, 34, 8);
    ctx.fillStyle =
      row.urgency === "Positive"
        ? "rgba(52, 211, 153, 0.16)"
        : row.urgency === "Medium"
          ? "rgba(96, 165, 250, 0.16)"
          : "rgba(239, 68, 68, 0.16)";
    ctx.fill();
    ctx.strokeStyle =
      row.urgency === "Positive"
        ? "rgba(52, 211, 153, 0.4)"
        : row.urgency === "Medium"
          ? "rgba(96, 165, 250, 0.4)"
          : "rgba(239, 68, 68, 0.4)";
    ctx.stroke();
    ctx.fillStyle =
      row.urgency === "Positive"
        ? "#86efac"
        : row.urgency === "Medium"
          ? "#93c5fd"
          : "#fca5a5";
    ctx.font = "bold 18px ui-monospace, monospace";
    ctx.fillText(row.urgency.toUpperCase(), pageX + 50, rowY + 24);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 28px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(row.name, pageX + 190, rowY + 26);

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "400 22px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const preview =
      row.preview.length > 72 ? `${row.preview.slice(0, 72)}...` : row.preview;
    ctx.fillText(preview, pageX + 190, rowY + 58);

    ctx.fillStyle = "#34d399";
    ctx.font = "700 24px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(row.value, WIDTH - pageX - 48, rowY + 40);
    ctx.textAlign = "left";

    if (i < feed.length - 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(pageX + 34, rowY + 74);
      ctx.lineTo(WIDTH - pageX - 34, rowY + 74);
      ctx.stroke();
    }
  });

  return canvas;
}

export const DASHBOARD_TEXTURE_SIZE = { width: WIDTH, height: HEIGHT };
