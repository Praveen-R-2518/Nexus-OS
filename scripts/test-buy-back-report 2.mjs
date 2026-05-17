import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/**
 * Reliable loader for KEY=value lines (BOM-safe). Dotenv CLI v17+ may report
 * "injected env (0)" when the file is empty on disk or uses unsupported formats.
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  let text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  text = text.replace(/\r\n/g, "\n");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const k = trimmed.slice(0, eq).trim();
    let v = trimmed.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    const existing = process.env[k];
    const missing =
      existing === undefined ||
      existing === "" ||
      String(existing).trim() === "";
    if (missing) process.env[k] = v;
  }
  return true;
}

loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

if (!process.env.OPENAI_API_KEY?.trim()) {
  const pLocal = path.join(root, ".env.local");
  const exists = fs.existsSync(pLocal);
  const size = exists ? fs.statSync(pLocal).size : 0;
  console.error(
    "OPENAI_API_KEY is not set after loading .env.local / .env from:\n",
    root,
  );
  console.error(
    `.env.local exists: ${exists}, size: ${size} bytes (if 0, save the file or add OPENAI_API_KEY=... on one line).`,
  );
  console.error(
    "\nOr set for this session only:\n  $env:OPENAI_API_KEY = \"sk-...\"\n",
  );
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const reportPrompt = fs.readFileSync(
  path.join(root, "ai_prompts", "buy_back_report_prompt.txt"),
  "utf8",
);

const demoMetrics = {
  report_date: "2026-05-17",
  business_name: "Nexus OS Demo Agency",
  total_conversations: 5,
  hot_leads: 3,
  pricing_questions: 1,
  booking_requests: 0,
  support_requests: 1,
  complaints: 1,
  churn_risks: 1,
  reply_drafts_created: 5,
  replies_approved: 3,
  follow_ups_scheduled: 2,
  estimated_hours_saved: 4,
  estimated_revenue_opportunity: 1850,
  revenue_at_risk: 1050,
  conversations: [
    {
      customer_name: "Ayesha Perera",
      channel: "website",
      intent: "pricing_question",
      urgency: "high",
      sentiment: "positive",
      risk_score: 88,
      estimated_value: 750,
      revenue_at_risk: 750,
      summary: "Salon owner wants website pricing and fast launch.",
      recommended_action:
        "Send website pricing and invite them to book a discovery call today.",
    },
    {
      customer_name: "Daniel Fernando",
      channel: "instagram",
      intent: "churn_risk",
      urgency: "critical",
      sentiment: "negative",
      risk_score: 76,
      estimated_value: 300,
      revenue_at_risk: 300,
      summary: "Customer may choose another agency due to slow response.",
      recommended_action:
        "Reply immediately, apologize for the delay, and offer package details or a quick call.",
    },
    {
      customer_name: "Maya Chen",
      channel: "email",
      intent: "support_issue",
      urgency: "medium",
      sentiment: "neutral",
      risk_score: 42,
      estimated_value: 500,
      revenue_at_risk: 0,
      summary: "Customer wants to reschedule an automation setup call.",
      recommended_action:
        "Confirm Monday availability and send updated meeting details.",
    },
    {
      customer_name: "Rizwan Ali",
      channel: "whatsapp",
      intent: "new_lead",
      urgency: "high",
      sentiment: "neutral",
      risk_score: 91,
      estimated_value: 500,
      revenue_at_risk: 0,
      summary:
        "Real estate business needs follow-up automation for lost inquiries.",
      recommended_action:
        "Explain automation setup and offer a short discovery call.",
    },
    {
      customer_name: "Nimali Jay",
      channel: "facebook",
      intent: "follow_up",
      urgency: "medium",
      sentiment: "positive",
      risk_score: 78,
      estimated_value: 300,
      revenue_at_risk: 0,
      summary: "Happy client is interested in monthly content support.",
      recommended_action:
        "Thank them and explain monthly marketing package options.",
    },
  ],
  workflow_logs: [
    "Classified 5 customer conversations",
    "Detected 3 hot leads",
    "Detected 1 critical churn risk",
    "Generated 5 reply drafts",
    "Scheduled 2 follow-ups",
    "Estimated 4 hours saved through automation",
  ],
};

const response = await client.responses.create({
  model: process.env.OPENAI_REPORT_MODEL ?? "gpt-5",
  input: [
    {
      role: "system",
      content: reportPrompt,
    },
    {
      role: "user",
      content: JSON.stringify(demoMetrics, null, 2),
    },
  ],
});

console.log(response.output_text ?? "");
