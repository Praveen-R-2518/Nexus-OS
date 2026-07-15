import type { AnalystContext, AnalystSnapshot, BusinessContext } from "./analyst-context";
import type { KnowledgeChunk } from "@/lib/embeddings/store";
import { DEFAULT_ANALYST_PERSONA } from "./persona";
import { chartPromptAddendum } from "./visuals";

/**
 * Assemble the Revenue Analyst system prompt: persona + business context + retrieved knowledge +
 * a compact JSON snapshot of the tenant's real inbox.
 *
 * The persona is founder-editable (business_profiles.chat_persona) but the RULES below are
 * ALWAYS appended on top and cannot be edited away — the guardrails are load-bearing (tested):
 *   - answer only from the provided data / knowledge base
 *   - if data is empty/missing, say so plainly instead of guessing
 *   - never fabricate numbers, names, or outcomes
 *   - never claim to have sent, edited, or taken any action (read-only agent)
 */

const RULES = [
  "Answer ONLY from the DATA SNAPSHOT, BUSINESS CONTEXT, and KNOWLEDGE BASE provided below. Do not use outside knowledge about this business.",
  "NEVER fabricate or estimate numbers, customer names, revenue figures, or counts. If a figure is not in the snapshot, say you don't have it.",
  "If the snapshot is empty or a section has no data, say so plainly — e.g. \"No messages have come in yet — here's what I'll watch for once they do\" — and do not invent activity.",
  "You are READ-ONLY. You cannot send, edit, approve, or write anything. NEVER claim to have sent a reply, approved a draft, or taken any action.",
  "You may SUGGEST next steps (e.g. \"you have 3 drafts waiting in the approval queue\"), but the founder takes those actions in the Approval Queue — not you.",
  "Be concise and specific. Prefer the founder's actual numbers and customer names from the snapshot over vague generalities.",
  "All amounts are in the business's own currency as stored; present them as given without inventing a currency symbol you don't have.",
  "The KNOWLEDGE BASE is authoritative context about how this business operates (from the founder's own uploaded documents and past summaries). Use it to ground your advice, but still never invent figures that aren't in the DATA SNAPSHOT.",
  "When your answer draws on a KNOWLEDGE BASE entry, cite it inline with its bracketed number (e.g. [1]) so the founder can see which source grounded the claim.",
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

function formatKnowledge(knowledge: KnowledgeChunk[]): string {
  if (!knowledge || knowledge.length === 0) return "";
  const kindLabel: Record<string, string> = {
    business_doc: "Business document",
    summary: "Prior summary",
    conversation: "Inbox message",
  };
  const blocks = knowledge.map((k, i) => {
    const label = kindLabel[k.kind] ?? "Knowledge";
    return `[${i + 1}] (${label}) ${k.content.trim()}`;
  });
  return [
    "KNOWLEDGE BASE (retrieved from the founder's uploaded documents & summaries, most relevant first):",
    ...blocks,
  ].join("\n");
}

export function buildAnalystSystemPrompt(context: AnalystContext): string {
  const { snapshot, business, knowledge } = context;
  // The persona layer is founder-editable; the RULES guardrails below are always enforced on top.
  const persona = business?.persona?.trim() || DEFAULT_ANALYST_PERSONA;
  const emptyNote = snapshot.isEmpty
    ? "\n\nNOTE: This tenant has no conversations yet. Be honest that the inbox is empty and describe what you will watch for once messages arrive. Do not imply any activity has happened."
    : "";
  const knowledgeBlock = formatKnowledge(knowledge ?? []);
  // Visuals are opt-out per workspace (business_profiles.chat_visuals_enabled);
  // default ON when no profile exists yet.
  const visualsBlock = business?.chatVisualsEnabled !== false ? chartPromptAddendum() : "";

  return [
    persona,
    "",
    "RULES:",
    ...RULES.map((r) => `- ${r}`),
    ...(visualsBlock ? ["", visualsBlock] : []),
    "",
    formatBusiness(business),
    ...(knowledgeBlock ? ["", knowledgeBlock] : []),
    "",
    formatSnapshot(snapshot),
    emptyNote,
  ].join("\n");
}
