import "server-only";

import {
  EMAIL_DRAFT_PROMPT_VERSION,
  MAX_BODY_LENGTH,
  MAX_FACT_LENGTH,
  MAX_FACTS,
  MAX_SITUATION_LENGTH,
  MAX_SUBJECT_LENGTH,
} from "@/lib/ai/email-draft";
import { draftEmail, type DraftEmailResult } from "@/lib/ai/draft-email";
import { AiNotConfiguredError } from "@/lib/ai/provider";
import { writeAuditEvent } from "@/lib/audit";
import { getCandidate } from "@/lib/people/candidates";
import type { PeopleTenantContext } from "@/lib/people/employees";
import { getEmployee } from "@/lib/people/employees";
import { sendPeopleEmail } from "@/lib/people/email-transport";
import {
  PEOPLE_EMAIL_PURPOSES,
  PEOPLE_EMAIL_RECIPIENT_TYPES,
  PEOPLE_EMAIL_TONES,
  PEOPLE_MESSAGE_DRAFT_STATUSES,
  PEOPLE_EMAIL_TRANSPORTS,
  type PeopleEmailPurpose,
  type PeopleEmailRecipientType,
  type PeopleEmailTone,
  type PeopleEmailTransport,
  type PeopleMessageDraft,
  type PeopleMessageDraftStatus,
} from "@/types";

const GENERATE_FIELDS = [
  "recipient_type",
  "recipient_id",
  "purpose",
  "tone",
  "situation",
  "facts",
  "related_date",
] as const;

const LETTER_FIELDS = ["subject", "body"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PeopleEmailErr = { ok: false; status: number; error: string };
export type PeopleEmailOk<T> = { ok: true; data: T };

type ParsedGenerate = {
  recipientType: PeopleEmailRecipientType;
  recipientId: string;
  purpose: PeopleEmailPurpose;
  tone: PeopleEmailTone;
  situation: string;
  facts: string[];
  relatedDate: string | null;
};

type ParsedLetter = {
  subject?: string;
  body?: string;
};

function fail(status: number, message: string): PeopleEmailErr {
  return { ok: false, status, error: message };
}

function failDraftAi(
  result: Extract<DraftEmailResult, { status: "error" }>,
): PeopleEmailErr {
  switch (result.error) {
    case "budget_exceeded":
      return fail(429, result.message);
    case "malformed_output":
      return fail(502, result.message || "Could not generate email draft");
    default: {
      const _exhaustive: never = result;
      return fail(502, String(_exhaustive));
    }
  }
}

function isErr(value: { ok?: boolean }): value is PeopleEmailErr {
  return value.ok === false;
}

function unknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function extraFieldsError(keys: string[]): PeopleEmailErr {
  return fail(400, `Unexpected fields: ${keys.join(", ")}`);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isRecipientType(value: unknown): value is PeopleEmailRecipientType {
  return (
    typeof value === "string" &&
    (PEOPLE_EMAIL_RECIPIENT_TYPES as readonly string[]).includes(value)
  );
}

function isPurpose(value: unknown): value is PeopleEmailPurpose {
  return (
    typeof value === "string" &&
    (PEOPLE_EMAIL_PURPOSES as readonly string[]).includes(value)
  );
}

function isTone(value: unknown): value is PeopleEmailTone {
  return (
    typeof value === "string" &&
    (PEOPLE_EMAIL_TONES as readonly string[]).includes(value)
  );
}

function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function parseFacts(raw: unknown): { ok: true; value: string[] } | PeopleEmailErr {
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return fail(400, "facts must be an array of strings");
  const facts: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return fail(400, "facts must be an array of strings");
    }
    const trimmed = item.trim().slice(0, MAX_FACT_LENGTH);
    if (trimmed) facts.push(trimmed);
    if (facts.length >= MAX_FACTS) break;
  }
  return { ok: true, value: facts };
}

function parseRelatedDate(
  raw: unknown,
): { ok: true; value: string | null } | PeopleEmailErr {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return fail(400, "related_date must be a YYYY-MM-DD date or null");
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!isIsoDate(trimmed)) {
    return fail(400, "related_date must be a YYYY-MM-DD date or null");
  }
  return { ok: true, value: trimmed };
}

function parseGenerateBody(
  body: Record<string, unknown>,
): { ok: true; data: ParsedGenerate } | PeopleEmailErr {
  const extra = unknownKeys(body, GENERATE_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  if (!isRecipientType(body.recipient_type)) {
    return fail(
      400,
      `recipient_type must be one of: ${PEOPLE_EMAIL_RECIPIENT_TYPES.join(", ")}`,
    );
  }
  if (typeof body.recipient_id !== "string" || !UUID_RE.test(body.recipient_id.trim())) {
    return fail(400, "recipient_id must be a UUID");
  }
  if (!isPurpose(body.purpose)) {
    return fail(
      400,
      `purpose must be one of: ${PEOPLE_EMAIL_PURPOSES.join(", ")}`,
    );
  }
  if (!isTone(body.tone)) {
    return fail(400, `tone must be one of: ${PEOPLE_EMAIL_TONES.join(", ")}`);
  }

  const situation = boundedString(body.situation, MAX_SITUATION_LENGTH);
  if (!situation) return fail(400, "situation is required");

  const facts = parseFacts(body.facts);
  if (isErr(facts)) return facts;
  const relatedDate = parseRelatedDate(body.related_date);
  if (isErr(relatedDate)) return relatedDate;

  return {
    ok: true,
    data: {
      recipientType: body.recipient_type,
      recipientId: body.recipient_id.trim(),
      purpose: body.purpose,
      tone: body.tone,
      situation,
      facts: facts.value,
      relatedDate: relatedDate.value,
    },
  };
}

function parseLetterBody(
  body: Record<string, unknown>,
  required: boolean,
): { ok: true; data: ParsedLetter } | PeopleEmailErr {
  const extra = unknownKeys(body, LETTER_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const hasSubject = Object.prototype.hasOwnProperty.call(body, "subject");
  const hasBody = Object.prototype.hasOwnProperty.call(body, "body");
  if (required && !hasSubject && !hasBody) {
    return fail(400, "subject or body is required");
  }

  const patch: ParsedLetter = {};
  if (hasSubject) {
    const subject = boundedString(body.subject, MAX_SUBJECT_LENGTH);
    if (!subject) return fail(400, "subject is required");
    patch.subject = subject;
  }
  if (hasBody) {
    const letterBody = boundedString(body.body, MAX_BODY_LENGTH);
    if (!letterBody) return fail(400, "body is required");
    patch.body = letterBody;
  }
  return { ok: true, data: patch };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asRecipientType(value: unknown): PeopleEmailRecipientType {
  if (isRecipientType(value)) return value;
  return "employee";
}

function asPurpose(value: unknown): PeopleEmailPurpose | null {
  return isPurpose(value) ? value : null;
}

function asTone(value: unknown): PeopleEmailTone | null {
  return isTone(value) ? value : null;
}

function asStatus(value: unknown): PeopleMessageDraftStatus {
  if (
    typeof value === "string" &&
    (PEOPLE_MESSAGE_DRAFT_STATUSES as readonly string[]).includes(value)
  ) {
    return value as PeopleMessageDraftStatus;
  }
  return "draft";
}

function asTransport(value: unknown): PeopleEmailTransport | null {
  if (
    typeof value === "string" &&
    (PEOPLE_EMAIL_TRANSPORTS as readonly string[]).includes(value)
  ) {
    return value as PeopleEmailTransport;
  }
  return null;
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapDraft(row: Record<string, unknown>): PeopleMessageDraft {
  return {
    id: String(row.id ?? ""),
    team_id: String(row.team_id ?? ""),
    workspace_id: typeof row.workspace_id === "string" ? row.workspace_id : null,
    recipient_type: asRecipientType(row.recipient_type),
    employee_id: typeof row.employee_id === "string" ? row.employee_id : null,
    candidate_id: typeof row.candidate_id === "string" ? row.candidate_id : null,
    recipient_name: typeof row.recipient_name === "string" ? row.recipient_name : null,
    recipient_email: String(row.recipient_email ?? ""),
    purpose: asPurpose(row.purpose),
    tone: asTone(row.tone),
    situation: typeof row.situation === "string" ? row.situation : null,
    facts: asStringArray(row.facts),
    related_date: typeof row.related_date === "string" ? row.related_date : null,
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    status: asStatus(row.status),
    sent_at: typeof row.sent_at === "string" ? row.sent_at : null,
    provider_message_id:
      typeof row.provider_message_id === "string" ? row.provider_message_id : null,
    transport: asTransport(row.transport),
    ai_model: typeof row.ai_model === "string" ? row.ai_model : null,
    ai_prompt_version:
      typeof row.ai_prompt_version === "string" ? row.ai_prompt_version : null,
    ai_metadata: asMetadata(row.ai_metadata),
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function auditSnapshot(draft: PeopleMessageDraft): Record<string, unknown> {
  return {
    status: draft.status,
    recipient_type: draft.recipient_type,
    recipient_email: draft.recipient_email,
    purpose: draft.purpose,
    tone: draft.tone,
  };
}

async function loadRecipient(
  ctx: PeopleTenantContext,
  recipientType: PeopleEmailRecipientType,
  recipientId: string,
): Promise<
  | {
      ok: true;
      name: string;
      email: string;
      role: string | undefined;
      employeeId: string | null;
      candidateId: string | null;
    }
  | PeopleEmailErr
> {
  switch (recipientType) {
    case "employee": {
      const employee = await getEmployee(ctx, recipientId);
      if (!employee.ok) return employee;
      const email = employee.data.email?.trim() ?? "";
      if (!email || !EMAIL_RE.test(email)) {
        return fail(400, "Recipient has no email");
      }
      return {
        ok: true,
        name: employee.data.full_name,
        email,
        role: employee.data.role_title ?? undefined,
        employeeId: employee.data.id,
        candidateId: null,
      };
    }
    case "candidate": {
      const candidate = await getCandidate(ctx, recipientId);
      if (!candidate.ok) return candidate;
      const email = candidate.data.email?.trim() ?? "";
      if (!email || !EMAIL_RE.test(email)) {
        return fail(400, "Recipient has no email");
      }
      return {
        ok: true,
        name: candidate.data.full_name,
        email,
        role: candidate.data.current_role ?? candidate.data.headline ?? undefined,
        employeeId: null,
        candidateId: candidate.data.id,
      };
    }
    default: {
      const _exhaustive: never = recipientType;
      return fail(400, `Unsupported recipient_type: ${String(_exhaustive)}`);
    }
  }
}

async function loadBusinessSnippets(
  ctx: PeopleTenantContext,
): Promise<{
  name?: string;
  industry?: string;
  tone?: string;
  services?: string[];
} | undefined> {
  let query = ctx.supabase
    .from("business_profiles")
    .select("name, industry, tone, services")
    .eq("team_id", ctx.teamId);
  if (ctx.workspaceId) {
    query = query.eq("workspace_id", ctx.workspaceId);
  }
  const { data, error } = await query.maybeSingle();
  if (error || !data) return undefined;

  const services = asStringArray(data.services);
  return {
    name: typeof data.name === "string" ? data.name : undefined,
    industry: typeof data.industry === "string" ? data.industry : undefined,
    tone: typeof data.tone === "string" ? data.tone : undefined,
    services: services.length > 0 ? services : undefined,
  };
}

export async function getDraft(
  ctx: PeopleTenantContext,
  id: string,
): Promise<PeopleEmailOk<PeopleMessageDraft> | PeopleEmailErr> {
  const trimmed = id.trim();
  if (!trimmed) return fail(400, "Missing draft id");

  const { data, error } = await ctx.supabase
    .from("people_message_drafts")
    .select("*")
    .eq("id", trimmed)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Draft not found");
  return { ok: true, data: mapDraft(data as Record<string, unknown>) };
}

function composeFacts(parsed: ParsedGenerate): string[] {
  const facts = [...parsed.facts];
  if (parsed.relatedDate) {
    facts.unshift(`Date: ${parsed.relatedDate}`);
  }
  return facts.slice(0, MAX_FACTS);
}

export async function generateDraft(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<PeopleEmailOk<PeopleMessageDraft> | PeopleEmailErr> {
  const parsed = parseGenerateBody(body);
  if (isErr(parsed)) return parsed;

  const recipient = await loadRecipient(
    ctx,
    parsed.data.recipientType,
    parsed.data.recipientId,
  );
  if (isErr(recipient)) return recipient;

  const facts = composeFacts(parsed.data);
  const business = await loadBusinessSnippets(ctx);

  let drafted: DraftEmailResult;
  try {
    drafted = await draftEmail({
      teamId: ctx.teamId,
      workspaceId: ctx.workspaceId,
      supabase: ctx.supabase,
      recipient: {
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
      },
      situation: parsed.data.situation,
      facts,
      tone: parsed.data.tone,
      purpose: parsed.data.purpose,
      business,
    });
  } catch (caught) {
    if (caught instanceof AiNotConfiguredError) {
      return fail(503, "ai_not_configured");
    }
    return fail(
      502,
      caught instanceof Error ? caught.message : "Failed to generate email draft",
    );
  }

  if (drafted.status === "error") {
    return failDraftAi(drafted);
  }

  const insert = {
    team_id: ctx.teamId,
    workspace_id: ctx.workspaceId,
    recipient_type: parsed.data.recipientType,
    employee_id: recipient.employeeId,
    candidate_id: recipient.candidateId,
    recipient_name: recipient.name,
    recipient_email: recipient.email,
    purpose: parsed.data.purpose,
    tone: parsed.data.tone,
    situation: parsed.data.situation,
    facts,
    related_date: parsed.data.relatedDate,
    subject: drafted.subject,
    body: drafted.body,
    status: "draft" as const,
    ai_model: drafted.metadata.model,
    ai_prompt_version: EMAIL_DRAFT_PROMPT_VERSION,
    ai_metadata: drafted.metadata,
    created_by: ctx.user.id,
  };

  const { data, error } = await ctx.supabase
    .from("people_message_drafts")
    .insert(insert)
    .select("*")
    .single();

  if (error) return fail(500, error.message || "Failed to save draft");
  if (!data) return fail(500, "Failed to save draft");

  const created = mapDraft(data as Record<string, unknown>);
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "generate",
    entityType: "people_message_draft",
    entityId: created.id,
    prevState: null,
    nextState: auditSnapshot(created),
    metadata: {
      prompt_version: EMAIL_DRAFT_PROMPT_VERSION,
      model: drafted.metadata.model,
      recipient_type: parsed.data.recipientType,
    },
  });
  if (!audit.ok) return fail(500, audit.error);

  return { ok: true, data: created };
}

export async function updateDraft(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<PeopleEmailOk<PeopleMessageDraft> | PeopleEmailErr> {
  const existing = await getDraft(ctx, id);
  if (!existing.ok) return existing;
  if (existing.data.status !== "draft") {
    return fail(409, "Only draft emails can be edited");
  }

  const parsed = parseLetterBody(body, true);
  if (isErr(parsed)) return parsed;
  if (!parsed.data.subject && !parsed.data.body) {
    return fail(400, "subject or body is required");
  }

  const { data, error } = await ctx.supabase
    .from("people_message_drafts")
    .update({
      ...(parsed.data.subject ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.body ? { body: parsed.data.body } : {}),
    })
    .eq("id", existing.data.id)
    .eq("team_id", ctx.teamId)
    .eq("status", "draft")
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") return fail(404, "Draft not found");
    return fail(500, error.message || "Failed to update draft");
  }
  if (!data) return fail(404, "Draft not found");

  return { ok: true, data: mapDraft(data as Record<string, unknown>) };
}

export async function sendDraft(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<PeopleEmailOk<PeopleMessageDraft> | PeopleEmailErr> {
  const extra = unknownKeys(body, LETTER_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const existing = await getDraft(ctx, id);
  if (!existing.ok) return existing;
  if (existing.data.status === "sent") {
    return fail(409, "Email already sent");
  }
  if (existing.data.status === "discarded") {
    return fail(409, "Discarded drafts cannot be sent");
  }

  const letter = parseLetterBody(body, false);
  if (isErr(letter)) return letter;

  let current = existing.data;
  if (letter.data.subject || letter.data.body) {
    const updated = await updateDraft(ctx, existing.data.id, {
      subject: letter.data.subject ?? existing.data.subject,
      body: letter.data.body ?? existing.data.body,
    });
    if (!updated.ok) return updated;
    current = updated.data;
  }

  if (!current.recipient_email || !EMAIL_RE.test(current.recipient_email)) {
    return fail(400, "Recipient has no email");
  }

  const sent = await sendPeopleEmail(ctx.supabase, ctx.workspaceId, {
    to: current.recipient_email,
    subject: current.subject,
    body: current.body,
  });
  if (!sent.ok) return sent;

  const nowIso = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("people_message_drafts")
    .update({
      status: "sent",
      sent_at: nowIso,
      provider_message_id: sent.messageId || null,
      transport: sent.transport,
    })
    .eq("id", current.id)
    .eq("team_id", ctx.teamId)
    .eq("status", "draft")
    .select("*")
    .single();

  if (error) {
    if (error.code === "PGRST116") return fail(409, "Email already sent");
    return fail(500, error.message || "Failed to record send");
  }
  if (!data) return fail(409, "Email already sent");

  const recorded = mapDraft(data as Record<string, unknown>);
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "send",
    entityType: "people_message_draft",
    entityId: recorded.id,
    prevState: { status: "draft" },
    nextState: { status: "sent" },
    metadata: {
      messageId: sent.messageId,
      transport: sent.transport,
    },
  });
  if (!audit.ok) return fail(500, audit.error);

  return { ok: true, data: recorded };
}
