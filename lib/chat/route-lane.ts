/**
 * I1 — deterministic Chat mini-router. Pure function: no LLM, no DB, no server-only.
 *
 * Classifies the latest user turn into a closed lane and selects which (already
 * existing) People tools may be attached. Does not add tools, authorize mutations,
 * or interpret user text as a new allowlist.
 */

export const CHAT_LANES = ["people", "revenue", "smalltalk", "mixed"] as const;
export type ChatLane = (typeof CHAT_LANES)[number];

export type ChatLaneHistoryTurn = { role: "user" | "assistant"; content: string };

export const PEOPLE_LANE_TOOL_NAMES = [
  "search_employees",
  "search_candidates",
  "list_job_pipeline",
  "propose_pipeline_stage",
  "propose_employment_status",
] as const;

const TOOL_NAME_STRIP_RE =
  /\b(search_employees|search_candidates|list_job_pipeline|propose_pipeline_stage|propose_employment_status|update_employee|send_email|create_employee|hire_candidate|reject_candidate)\b/gi;

const GREETING_RE =
  /^(hi|hey|hello|yo|ok|okay|thanks|thank you|thx|good morning|good afternoon|good evening|what can you do|who are you|how are you|what are you)(\s+there)?[\s!.,?]*$/i;

const SMALLTALK_MAX_LEN = 80;

const PEOPLE_PHRASES = [
  "awaiting review",
  "match score",
  "employment status",
  "pipeline stage",
  "open job",
  "open jobs",
  "job opening",
  "job openings",
];

const REVENUE_PHRASES = [
  "at risk",
  "hot lead",
  "hot leads",
  "pending draft",
  "pending drafts",
  "approval queue",
  "churn risk",
];

const PEOPLE_WORDS = [
  "employee",
  "employees",
  "employment",
  "roster",
  "candidate",
  "candidates",
  "applicant",
  "applicants",
  "hiring",
  "hired",
  "hire",
  "shortlist",
  "shortlisted",
  "interview",
  "interviewing",
  "onboarding",
  "offboard",
  "offboarded",
  "offboarding",
  "recruiter",
  "recruitment",
  "headcount",
  "job",
  "jobs",
];

const REVENUE_WORDS = [
  "lead",
  "leads",
  "inbox",
  "draft",
  "drafts",
  "churn",
  "revenue",
  "customer",
  "customers",
  "reply",
  "replies",
  "approval",
  "gmail",
  "conversation",
  "conversations",
  "deal",
  "deals",
  "sales",
];

const PEOPLE_PIPELINE_MODS = [
  "candidate",
  "candidates",
  "job",
  "jobs",
  "stage",
  "shortlist",
  "shortlisted",
  "employee",
  "employees",
];

const REVENUE_PIPELINE_MODS = ["lead", "leads", "inbox", "sales", "deal", "deals"];

export type RouteChatLaneParams = {
  message: string;
  history?: ChatLaneHistoryTurn[];
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function stripToolNames(text: string): string {
  return text.replace(TOOL_NAME_STRIP_RE, " ");
}

function wordHit(text: string, word: string): boolean {
  return new RegExp(`\\b${word}\\b`, "i").test(text);
}

function phraseHit(text: string, phrase: string): boolean {
  return text.includes(phrase);
}

function countHits(text: string, phrases: string[], words: string[]): number {
  let n = 0;
  for (const phrase of phrases) {
    if (phraseHit(text, phrase)) n += 1;
  }
  for (const word of words) {
    if (wordHit(text, word)) n += 1;
  }
  return n;
}

function pipelineScores(text: string): { people: number; revenue: number } {
  if (!wordHit(text, "pipeline") && !wordHit(text, "pipelines")) {
    return { people: 0, revenue: 0 };
  }
  const peopleMod = PEOPLE_PIPELINE_MODS.some((w) => wordHit(text, w));
  const revenueMod = REVENUE_PIPELINE_MODS.some((w) => wordHit(text, w));
  if (peopleMod && revenueMod) return { people: 1, revenue: 1 };
  if (peopleMod) return { people: 1, revenue: 0 };
  if (revenueMod) return { people: 0, revenue: 1 };
  return { people: 1, revenue: 1 };
}

function isGreeting(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > SMALLTALK_MAX_LEN) return false;
  return GREETING_RE.test(trimmed);
}

type MessageClass = ChatLane | "unclassified";

function classifyMessage(raw: string): MessageClass {
  const stripped = normalize(stripToolNames(raw));
  const people = countHits(stripped, PEOPLE_PHRASES, PEOPLE_WORDS);
  const revenue = countHits(stripped, REVENUE_PHRASES, REVENUE_WORDS);
  const pipe = pipelineScores(stripped);
  const peopleScore = people + pipe.people;
  const revenueScore = revenue + pipe.revenue;

  if (peopleScore > 0 && revenueScore > 0) return "mixed";
  if (peopleScore > 0) return "people";
  if (revenueScore > 0) return "revenue";
  if (isGreeting(raw)) return "smalltalk";
  return "unclassified";
}

function stickyLane(history: ChatLaneHistoryTurn[], currentMessage: string): ChatLane | null {
  const currentNorm = normalize(currentMessage);
  const userTurns = history
    .filter((t) => t.role === "user")
    .map((t) => t.content);

  if (userTurns.length > 0 && normalize(userTurns[userTurns.length - 1] ?? "") === currentNorm) {
    userTurns.pop();
  }

  for (let i = userTurns.length - 1; i >= 0; i -= 1) {
    const prior = classifyMessage(userTurns[i] ?? "");
    if (prior === "smalltalk" || prior === "unclassified") continue;
    return prior;
  }
  return null;
}

export function routeChatLane(params: RouteChatLaneParams): ChatLane {
  const message = params.message ?? "";
  const classified = classifyMessage(message);
  if (classified !== "unclassified") return classified;

  const sticky = stickyLane(params.history ?? [], message);
  if (sticky) return sticky;
  return "mixed";
}

export function toolsForLane(lane: ChatLane): readonly string[] {
  switch (lane) {
    case "people":
    case "mixed":
      return PEOPLE_LANE_TOOL_NAMES;
    case "revenue":
    case "smalltalk":
      return [];
    default: {
      const _exhaustive: never = lane;
      return _exhaustive;
    }
  }
}

export function laneAttachesPeopleTools(lane: ChatLane): boolean {
  return toolsForLane(lane).length > 0;
}
