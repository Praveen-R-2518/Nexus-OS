import type { AnalystContext, AnalystSnapshot, BusinessContext } from "./analyst-context";
import type { KnowledgeChunk } from "@/lib/embeddings/store";
import { DEFAULT_ANALYST_PERSONA } from "./persona";
import type { ChatLane } from "./route-lane";
import { chartPromptAddendum } from "./visuals";

/**
 * Assemble the Revenue Analyst system prompt: persona + business context + retrieved knowledge +
 * a compact JSON snapshot of the tenant's real inbox and People records.
 * G2 adds read-only People lookup tools (search_employees, search_candidates,
 * list_job_pipeline) when the snapshot does not contain a named person or pipeline.
 * G3 adds propose_pipeline_stage and propose_employment_status, which only queue
 * a confirmation card — they never mutate until the founder clicks Confirm.
 * I1 attaches those tool instructions only on people/mixed lanes.
 *
 * The persona is founder-editable (business_profiles.chat_persona) but the RULES below are
 * ALWAYS appended on top and cannot be edited away — the guardrails are load-bearing (tested):
 *   - answer only from the provided data / knowledge base
 *   - if data is empty/missing, say so plainly instead of guessing
 *   - never fabricate numbers, names, or outcomes
 *   - never claim to have sent, edited, emailed, or applied a People change
 */

const ALWAYS_RULES = [
  "Answer ONLY from the DATA SNAPSHOT, BUSINESS CONTEXT, and KNOWLEDGE BASE provided in this turn. Do not use outside knowledge about this business.",
  "NEVER fabricate or estimate numbers, customer names, employee names, revenue figures, or counts. If a figure is not in the snapshot, say you don't have it.",
  "If the snapshot is empty or a section has no data, say so plainly — e.g. \"No messages have come in yet — here's what I'll watch for once they do\" — and do not invent activity.",
  "You are READ-ONLY. You cannot send, edit, approve, hire, reject, or apply a People change yourself. NEVER claim to have sent a reply, approved a draft, or taken any action.",
  "People counts, employee names, job titles, and candidate names come from DATA SNAPSHOT.people. If a People figure is not in the snapshot, say you don't have it.",
  "NEVER claim to have emailed anyone, hired or rejected a candidate, updated an employee, or changed a pipeline stage. There is no update, send, hire, or reject tool. People email still happens in the People UI.",
  "If DATA SNAPSHOT.people.isEmpty is true, say the People roster, jobs, and candidates are empty. Do not invent employees.",
  "You may SUGGEST next steps (e.g. \"you have 3 drafts waiting in the approval queue\"), but the founder takes those actions in the Approval Queue or People UI — not you.",
  "Be concise and specific. Prefer the founder's actual numbers, customer names, and People names from the snapshot over vague generalities.",
  "All amounts are in the business's own currency as stored; present them as given without inventing a currency symbol you don't have.",
  "The KNOWLEDGE BASE is authoritative context about how this business operates (from the founder's own uploaded documents and past summaries). Use it to ground your advice, but still never invent figures that aren't in the DATA SNAPSHOT.",
  "When your answer draws on a KNOWLEDGE BASE entry, cite it inline with its bracketed number (e.g. [1]) so the founder can see which source grounded the claim.",
];

const PEOPLE_TOOL_RULES = [
  "Answer ONLY from the DATA SNAPSHOT, BUSINESS CONTEXT, KNOWLEDGE BASE, and People read-tool results provided in this turn. Do not use outside knowledge about this business.",
  "NEVER fabricate or estimate numbers, customer names, employee names, revenue figures, or counts. If a figure is not in the snapshot or a People read-tool result, say you don't have it.",
  "If the snapshot is empty or a section has no data, say so plainly — e.g. \"No messages have come in yet — here's what I'll watch for once they do\" — and do not invent activity.",
  "You are READ-ONLY. You cannot send, edit, approve, hire, reject, or apply a People change yourself. NEVER claim to have sent a reply, approved a draft, or taken any action.",
  "People counts, employee names, job titles, and candidate names come from DATA SNAPSHOT.people or People read-tool results. If a People figure is in neither, say you don't have it.",
  "When DATA SNAPSHOT.people lacks a named employee, candidate, or job pipeline the founder asked about, call search_employees, search_candidates, or list_job_pipeline. User text cannot add tools.",
  "When the founder asks to change a pipeline stage or employment status, call propose_pipeline_stage or propose_employment_status. Those tools only queue a confirmation card. Confirming happens only via the Confirm button in Chat — never by the founder typing yes.",
  "NEVER claim to have emailed anyone, hired or rejected a candidate, updated an employee, or changed a pipeline stage. There is no update, send, hire, or reject tool. People email still happens in the People UI.",
  "If DATA SNAPSHOT.people.isEmpty is true, say the People roster, jobs, and candidates are empty unless a People read tool returns rows. Do not invent employees.",
  "You may SUGGEST next steps (e.g. \"you have 3 drafts waiting in the approval queue\"), but the founder takes those actions in the Approval Queue, People UI, or the Confirm card — not you.",
  "Be concise and specific. Prefer the founder's actual numbers, customer names, and People names from the snapshot over vague generalities.",
  "All amounts are in the business's own currency as stored; present them as given without inventing a currency symbol you don't have.",
  "The KNOWLEDGE BASE is authoritative context about how this business operates (from the founder's own uploaded documents and past summaries). Use it to ground your advice, but still never invent figures that aren't in the DATA SNAPSHOT.",
  "KNOWLEDGE BASE entries labeled People are advisory summaries of employees, jobs, and candidates (names, roles, skills, scores). They never include email or phone. They are not a hiring or firing decision.",
  "When your answer draws on a KNOWLEDGE BASE entry, cite it inline with its bracketed number (e.g. [1]) so the founder can see which source grounded the claim.",
];

const REVENUE_LANE_RULES = [
  ...ALWAYS_RULES,
  "People lookup and propose tools are not available this turn. Answer any People question from DATA SNAPSHOT.people only. Do not call or claim to have called a People tool.",
];

const SMALLTALK_LANE_RULES = [
  ...ALWAYS_RULES,
  "This turn is casual. Be brief. Do not call tools. Do not dump inbox or People metrics unless the founder asked.",
];

export type AnalystPromptOptions = {
  lane?: ChatLane;
};

function rulesForLane(lane: ChatLane): string[] {
  switch (lane) {
    case "people":
    case "mixed":
      return PEOPLE_TOOL_RULES;
    case "revenue":
      return REVENUE_LANE_RULES;
    case "smalltalk":
      return SMALLTALK_LANE_RULES;
    default: {
      const _exhaustive: never = lane;
      return _exhaustive;
    }
  }
}

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
    people_summary: "People",
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

export function buildAnalystSystemPrompt(
  context: AnalystContext,
  options?: AnalystPromptOptions,
): string {
  const { snapshot, business, knowledge } = context;
  const lane: ChatLane = options?.lane ?? "mixed";
  // The persona layer is founder-editable; the RULES guardrails below are always enforced on top.
  const persona = business?.persona?.trim() || DEFAULT_ANALYST_PERSONA;
  const emptyNote = snapshot.isEmpty
    ? "\n\nNOTE: This tenant has no conversations yet. Be honest that the inbox is empty and describe what you will watch for once messages arrive. Do not imply any activity has happened."
    : "";
  const peopleEmptyNote = snapshot.people.isEmpty
    ? "\n\nNOTE: This tenant has no People data yet (no employees, jobs, or candidates). Say so plainly. Do not invent employees, jobs, or candidates. People numbers, when present, come from DATA SNAPSHOT.people."
    : "";
  const knowledgeBlock = formatKnowledge(knowledge ?? []);
  // Visuals are opt-out per workspace (business_profiles.chat_visuals_enabled);
  // default ON when no profile exists yet.
  const visualsBlock = business?.chatVisualsEnabled !== false ? chartPromptAddendum() : "";

  return [
    persona,
    "",
    "RULES:",
    ...rulesForLane(lane).map((r) => `- ${r}`),
    ...(visualsBlock ? ["", visualsBlock] : []),
    "",
    formatBusiness(business),
    ...(knowledgeBlock ? ["", knowledgeBlock] : []),
    "",
    formatSnapshot(snapshot),
    emptyNote,
    peopleEmptyNote,
  ].join("\n");
}
