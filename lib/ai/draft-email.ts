import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMAIL_DRAFT_PROMPT_FILE,
  buildDraftEmailUserPayload,
  buildEmailDraftMetadata,
  parseEmailDraftJson,
  type EmailDraftInput,
  type EmailDraftMetadata,
} from "./email-draft";
import { assertPeopleAiAllowed, peopleAiBudgetErrorMessage } from "./budget";
import { loadPrompt } from "./prompts";
import {
  AI_MODELS,
  AiNotConfiguredError,
  extractTokenUsage,
  getOpenAiClient,
  isMockMode,
  recordAiUsage,
} from "./provider";

export {
  EMAIL_DRAFT_PROMPT_VERSION,
  type EmailDraftBusiness,
  type EmailDraftFields,
  type EmailDraftInput,
  type EmailDraftMetadata,
  type EmailDraftRecipient,
} from "./email-draft";

export type DraftEmailParams = EmailDraftInput & {
  teamId: string;
  workspaceId?: string | null;
  supabase?: SupabaseClient;
};

export type DraftEmailSuccess = {
  status: "success";
  subject: string;
  body: string;
  metadata: EmailDraftMetadata;
};

export type DraftEmailMalformed = {
  status: "error";
  error: "malformed_output";
  message: string;
  model: string | null;
};

export type DraftEmailBudgetExceeded = {
  status: "error";
  error: "budget_exceeded";
  message: string;
  model: string | null;
};

export type DraftEmailResult =
  | DraftEmailSuccess
  | DraftEmailMalformed
  | DraftEmailBudgetExceeded;

const MOCK_SUBJECT = "Follow-up on your request";
const MOCK_BODY = [
  "Hello,",
  "",
  "Thank you for the update. We will follow up shortly with next steps.",
  "",
  "Best regards",
].join("\n");

function malformed(model: string | null, message: string): DraftEmailMalformed {
  return { status: "error", error: "malformed_output", message, model };
}

/**
 * Draft a generic outbound email letter. Never sends. Throws `AiNotConfiguredError`
 * when no key is configured. Provider failures throw. Malformed model JSON returns
 * `{ status: "error", error: "malformed_output" }` so callers can retry.
 */
export async function draftEmail(params: DraftEmailParams): Promise<DraftEmailResult> {
  const model = AI_MODELS.EMAIL_DRAFT;
  const input: EmailDraftInput = {
    recipient: params.recipient,
    situation: params.situation,
    facts: params.facts,
    tone: params.tone,
    purpose: params.purpose,
    business: params.business,
  };

  if (params.supabase) {
    const gate = await assertPeopleAiAllowed(params.supabase, params.teamId);
    if (!gate.allowed) {
      return {
        status: "error",
        error: "budget_exceeded",
        message: peopleAiBudgetErrorMessage(gate),
        model: null,
      };
    }
  }

  if (isMockMode()) {
    const parsed = parseEmailDraftJson(
      JSON.stringify({ subject: MOCK_SUBJECT, body: MOCK_BODY }),
    );
    if (!parsed.ok) {
      return malformed(model, "invalid mock fixture");
    }
    return {
      status: "success",
      subject: parsed.draft.subject,
      body: parsed.draft.body,
      metadata: buildEmailDraftMetadata({ model, source: "mock", input }),
    };
  }

  const client = getOpenAiClient();
  if (!client) throw new AiNotConfiguredError();

  const system = loadPrompt(EMAIL_DRAFT_PROMPT_FILE);
  const user = buildDraftEmailUserPayload(input);

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: 2500,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = completion.choices?.[0]?.message?.content;
  if (!text) {
    return malformed(model, "empty model response");
  }

  const parsed = parseEmailDraftJson(text);
  if (!parsed.ok) {
    return malformed(model, "invalid email draft JSON");
  }

  if (params.supabase) {
    const { inputTokens, outputTokens } = extractTokenUsage(completion.usage);
    await recordAiUsage(params.supabase, {
      teamId: params.teamId,
      workspaceId: params.workspaceId,
      model,
      operation: "email_draft",
      inputTokens,
      outputTokens,
    });
  }

  return {
    status: "success",
    subject: parsed.draft.subject,
    body: parsed.draft.body,
    metadata: buildEmailDraftMetadata({ model, source: "openai", input }),
  };
}
