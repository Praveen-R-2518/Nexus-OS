import type { AnalystContext, AnalystSnapshot, BusinessContext } from "./analyst-context";

/**
 * Assemble the Revenue Analyst system prompt: persona + business context + a compact JSON
 * snapshot of the tenant's real inbox. The model answers ONLY from this data.
 *
 * Guardrails encoded here are load-bearing (tested):
 *   - answer only from the provided data
 *   - if data is empty/missing, say so plainly instead of guessing
 *   - never fabricate numbers, names, or outcomes
 *   - never claim to have sent, edited, or taken any action (read-only agent)
 */

const PERSONA = `You are the Revenue Analyst for Nexus OS — a read-only assistant for a founder or small team.
You help them triage their customer inbox: what's at risk, who to reply to first, and what happened this week.`;

const RULES = [
  "Answer ONLY from the DATA SNAPSHOT and BUSINESS CONTEXT provided below. Do not use outside knowledge about this business.",
  "NEVER fabricate or estimate numbers, customer names, revenue figures, or counts. If a figure is not in the snapshot, say you don't have it.",
  "If the snapshot is empty or a section has no data, say so plainly — e.g. \"No messages have come in yet — here's what I'll watch for once they do\" — and do not invent activity.",
  "You are READ-ONLY. You cannot send, edit, approve, or write anything. NEVER claim to have sent a reply, approved a draft, or taken any action.",
  "You may SUGGEST next steps (e.g. \"you have 3 drafts waiting in the approval queue\"), but the founder takes those actions in the Approval Queue — not you.",
  "Be concise and specific. Prefer the founder's actual numbers and customer names from the snapshot over vague generalities.",
  "All amounts are in the business's own currency as stored; present them as given without inventing a currency symbol you don't have.",
];

function formatBusiness(business: BusinessContext | null): string {
  if (!business) {
    return "BUSINESS CONTEXT: (not configured yet — the founder has not completed their business profile.)";
  }
  const services =
    business.services.length > 0 ? business.services.join(", ") : "none listed";
  return [
    "BUSINESS CONTEXT:",
    `- Name: ${business.name}`,
    `- Industry: ${business.industry}`,
    `- Preferred tone: ${business.tone}`,
    `- Services: ${services}`,
    `- Approval mode: ${business.approvalMode}`,
  ].join("\n");
}

function formatSnapshot(snapshot: AnalystSnapshot): string {
  // Compact, deterministic JSON keeps token cost low and gives the model exact figures.
  return `DATA SNAPSHOT (real, tenant-scoped; generated ${snapshot.generatedAt}):\n${JSON.stringify(
    snapshot,
    null,
    0,
  )}`;
}

export function buildAnalystSystemPrompt(context: AnalystContext): string {
  const { snapshot, business } = context;
  const emptyNote = snapshot.isEmpty
    ? "\n\nNOTE: This tenant has no conversations yet. Be honest that the inbox is empty and describe what you will watch for once messages arrive. Do not imply any activity has happened."
    : "";

  return [
    PERSONA,
    "",
    "RULES:",
    ...RULES.map((r) => `- ${r}`),
    "",
    formatBusiness(business),
    "",
    formatSnapshot(snapshot),
    emptyNote,
  ].join("\n");
}
