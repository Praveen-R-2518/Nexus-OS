import {
  JSON_LIMITS,
  jsonError,
  rateLimit,
  readJsonObjectWithLimit,
  requireApiTenantContext,
} from "@/lib/api-security";
import { completeText } from "@/lib/chat/openai";

export const dynamic = "force-dynamic";

const MAX_INPUT_LEN = 8000;

const ENHANCE_SYSTEM_PROMPT = `You are a prompt engineer. You rewrite a founder's rough draft into a clear, well-structured SYSTEM PROMPT for a "specialized business analyst" AI assistant that advises founders on their customer inbox and revenue.

Apply prompt-engineering best practices:
- Organize into clear sections (e.g. Role, Objective, Method, Style, Constraints) using markdown headings.
- Make the role concrete: a specialized business/revenue analyst giving sharp, actionable advice.
- Preserve any specific intent, domain, or wording the founder included; expand and sharpen rather than replace it.
- Keep it focused and practical — no fluff, no invented facts about the business.
- Do NOT add safety/guardrail rules about being read-only or not fabricating numbers — those are enforced separately by the system.

Return ONLY the rewritten system prompt as plain text/markdown. No preamble, no explanation, no code fences.`;

/**
 * POST /api/settings/enhance-persona  { text }  →  { enhanced }
 * Rewrites the founder's Chat personalization draft into a structured system prompt.
 * Mirrors the image-prompt "enhance" idea but as a first-party, auth-gated OpenAI route.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "api:enhance-persona", 15, 60_000);
  if (limited) return limited;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return jsonError("Enhance is not configured (OPENAI_API_KEY missing)", 503);
  }

  const tenant = await requireApiTenantContext();
  if (!tenant.ok) return tenant.response;

  const parsed = await readJsonObjectWithLimit(request, JSON_LIMITS.small);
  if (!parsed.ok) return parsed.response;

  const raw = parsed.body.text;
  const text = typeof raw === "string" ? raw.trim().slice(0, MAX_INPUT_LEN) : "";
  if (!text) return jsonError("text is required", 400);

  try {
    const enhanced = await completeText({
      system: ENHANCE_SYSTEM_PROMPT,
      user: text,
      temperature: 0.5,
      maxTokens: 900,
    });
    if (!enhanced) return jsonError("The enhancer returned nothing. Try again.", 502);
    return Response.json({ enhanced });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Enhance failed", 500);
  }
}
