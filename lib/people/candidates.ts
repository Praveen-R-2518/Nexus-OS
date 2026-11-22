import "server-only";

import { writeAuditEvent } from "@/lib/audit";
import { scheduleCandidateSummaryEmbed } from "@/lib/people/embed";
import type { PeopleTenantContext } from "@/lib/people/employees";
import {
  isCandidateSourceId,
  parseSourceMetadata,
  type NormalizedCandidate,
} from "@/lib/people/sources";
import {
  CONSENT_STATUSES,
  type Candidate,
  type ConsentStatus,
} from "@/types";

export { CONSENT_STATUSES };

const CREATE_FIELDS = [
  "full_name",
  "email",
  "phone",
  "headline",
  "current_role",
  "experience_years",
  "skills",
  "location",
  "source",
  "source_url",
  "consent_status",
  "notes",
] as const;

const PATCH_FIELDS = [...CREATE_FIELDS, "archived"] as const;

const LIMITS = {
  full_name: 250,
  email: 320,
  phone: 80,
  headline: 250,
  current_role: 250,
  location: 250,
  source: 120,
  source_url: 2000,
  notes: 10_000,
  search: 200,
  skill: 80,
  skills: 50,
  years: 50,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUDIT_DIFF_KEYS = [
  "full_name",
  "email",
  "phone",
  "headline",
  "current_role",
  "experience_years",
  "location",
  "source",
  "source_url",
  "consent_status",
  "archived_at",
] as const;

export type CandidateErr = { ok: false; status: number; error: string };
export type CandidateOk<T> = { ok: true; data: T };
export type CandidateListOk = { ok: true; data: Candidate[]; count: number };

export type ListCandidatesQuery = {
  ok: true;
  q: string | null;
  includeArchived: boolean;
  consentStatus: ConsentStatus | null;
  limit: number;
  offset: number;
};

type ParsedCreate = {
  full_name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  current_role: string | null;
  experience_years: number | null;
  skills: string[];
  location: string | null;
  source: string | null;
  source_url: string | null;
  consent_status: ConsentStatus;
  notes: string | null;
};

type ParsedPatch = {
  fields: Partial<ParsedCreate>;
  archived?: boolean;
};

function fail(status: number, error: string): CandidateErr {
  return { ok: false, status, error };
}

function isErr(value: { ok?: boolean }): value is CandidateErr {
  return value.ok === false;
}

function unknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function extraFieldsError(keys: string[]): CandidateErr {
  return fail(400, `Unexpected fields: ${keys.join(", ")}`);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function isConsentStatus(value: unknown): value is ConsentStatus {
  return (
    typeof value === "string" &&
    CONSENT_STATUSES.includes(value as ConsentStatus)
  );
}

function parseOptionalEmail(
  body: Record<string, unknown>,
): { ok: true; value: string | null | undefined } | CandidateErr {
  if (!hasOwn(body, "email")) return { ok: true, value: undefined };
  const raw = body.email;
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return fail(400, "email must be a string or null");
  const trimmed = raw.trim().slice(0, LIMITS.email);
  if (!trimmed) return { ok: true, value: null };
  if (!EMAIL_RE.test(trimmed)) return fail(400, "email is invalid");
  return { ok: true, value: trimmed };
}

function parseOptionalText(
  body: Record<string, unknown>,
  key:
    | "phone"
    | "headline"
    | "current_role"
    | "location"
    | "source"
    | "source_url"
    | "notes",
): { ok: true; value: string | null | undefined } | CandidateErr {
  if (!hasOwn(body, key)) return { ok: true, value: undefined };
  const raw = body[key];
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return fail(400, `${key} must be a string or null`);
  return { ok: true, value: boundedString(raw, LIMITS[key]) };
}

function parseConsentStatus(
  body: Record<string, unknown>,
  required: boolean,
): { ok: true; value: ConsentStatus | undefined } | CandidateErr {
  if (!hasOwn(body, "consent_status")) {
    if (required) return { ok: true, value: "owner_imported" };
    return { ok: true, value: undefined };
  }
  if (!isConsentStatus(body.consent_status)) {
    return fail(
      400,
      `consent_status must be one of: ${CONSENT_STATUSES.join(", ")}`,
    );
  }
  return { ok: true, value: body.consent_status };
}

function parseExperienceYears(
  body: Record<string, unknown>,
): { ok: true; value: number | null | undefined } | CandidateErr {
  if (!hasOwn(body, "experience_years")) return { ok: true, value: undefined };
  const raw = body.experience_years;
  if (raw === null || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) {
    return fail(400, "experience_years must be a number or null");
  }
  if (n < 0) return fail(400, "experience_years must be greater than or equal to 0");
  if (n > LIMITS.years) {
    return fail(400, `experience_years must not exceed ${LIMITS.years}`);
  }
  return { ok: true, value: n };
}

function parseSkillList(
  body: Record<string, unknown>,
): { ok: true; value: string[] | undefined } | CandidateErr {
  if (!hasOwn(body, "skills")) return { ok: true, value: undefined };
  const raw = body.skills;
  if (raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return fail(400, "skills must be an array of strings");
  if (raw.length > LIMITS.skills) {
    return fail(400, `skills must not exceed ${LIMITS.skills} items`);
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return fail(400, "skills must be an array of strings");
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > LIMITS.skill) {
      return fail(400, `skills entries must be at most ${LIMITS.skill} characters`);
    }
    out.push(trimmed);
  }
  return { ok: true, value: out };
}

function parseCreateBody(
  body: Record<string, unknown>,
): { ok: true; data: ParsedCreate } | CandidateErr {
  const extra = unknownKeys(body, CREATE_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const fullName = boundedString(body.full_name, LIMITS.full_name);
  if (!fullName) return fail(400, "full_name is required");

  const email = parseOptionalEmail(body);
  if (isErr(email)) return email;
  const phone = parseOptionalText(body, "phone");
  if (isErr(phone)) return phone;
  const headline = parseOptionalText(body, "headline");
  if (isErr(headline)) return headline;
  const currentRole = parseOptionalText(body, "current_role");
  if (isErr(currentRole)) return currentRole;
  const location = parseOptionalText(body, "location");
  if (isErr(location)) return location;
  const source = parseOptionalText(body, "source");
  if (isErr(source)) return source;
  const sourceUrl = parseOptionalText(body, "source_url");
  if (isErr(sourceUrl)) return sourceUrl;
  const notes = parseOptionalText(body, "notes");
  if (isErr(notes)) return notes;
  const years = parseExperienceYears(body);
  if (isErr(years)) return years;
  const skills = parseSkillList(body);
  if (isErr(skills)) return skills;
  const consent = parseConsentStatus(body, true);
  if (isErr(consent)) return consent;

  return {
    ok: true,
    data: {
      full_name: fullName,
      email: email.value ?? null,
      phone: phone.value ?? null,
      headline: headline.value ?? null,
      current_role: currentRole.value ?? null,
      experience_years: years.value ?? null,
      skills: skills.value ?? [],
      location: location.value ?? null,
      source: source.value ?? null,
      source_url: sourceUrl.value ?? null,
      consent_status: consent.value ?? "owner_imported",
      notes: notes.value ?? null,
    },
  };
}

function parsePatchBody(
  body: Record<string, unknown>,
): { ok: true; data: ParsedPatch } | CandidateErr {
  const extra = unknownKeys(body, PATCH_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const fields: ParsedPatch["fields"] = {};

  if (hasOwn(body, "full_name")) {
    const fullName = boundedString(body.full_name, LIMITS.full_name);
    if (!fullName) return fail(400, "full_name is required");
    fields.full_name = fullName;
  }

  const email = parseOptionalEmail(body);
  if (isErr(email)) return email;
  if (email.value !== undefined) fields.email = email.value;

  const phone = parseOptionalText(body, "phone");
  if (isErr(phone)) return phone;
  if (phone.value !== undefined) fields.phone = phone.value;

  const headline = parseOptionalText(body, "headline");
  if (isErr(headline)) return headline;
  if (headline.value !== undefined) fields.headline = headline.value;

  const currentRole = parseOptionalText(body, "current_role");
  if (isErr(currentRole)) return currentRole;
  if (currentRole.value !== undefined) fields.current_role = currentRole.value;

  const location = parseOptionalText(body, "location");
  if (isErr(location)) return location;
  if (location.value !== undefined) fields.location = location.value;

  const source = parseOptionalText(body, "source");
  if (isErr(source)) return source;
  if (source.value !== undefined) fields.source = source.value;

  const sourceUrl = parseOptionalText(body, "source_url");
  if (isErr(sourceUrl)) return sourceUrl;
  if (sourceUrl.value !== undefined) fields.source_url = sourceUrl.value;

  const notes = parseOptionalText(body, "notes");
  if (isErr(notes)) return notes;
  if (notes.value !== undefined) fields.notes = notes.value;

  const years = parseExperienceYears(body);
  if (isErr(years)) return years;
  if (years.value !== undefined) fields.experience_years = years.value;

  const skills = parseSkillList(body);
  if (isErr(skills)) return skills;
  if (skills.value !== undefined) fields.skills = skills.value;

  const consent = parseConsentStatus(body, false);
  if (isErr(consent)) return consent;
  if (consent.value !== undefined) fields.consent_status = consent.value;

  let archived: boolean | undefined;
  if (hasOwn(body, "archived")) {
    if (typeof body.archived !== "boolean") {
      return fail(400, "archived must be a boolean");
    }
    archived = body.archived;
  }

  if (Object.keys(fields).length === 0 && archived === undefined) {
    return fail(400, "No fields to update");
  }

  return { ok: true, data: { fields, archived } };
}

function isUniqueEmailConflict(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = error.message ?? "";
  return message.includes("candidates_team_lower_email_active_uidx");
}

function uniqueEmailError(): CandidateErr {
  return fail(409, "A candidate with this email already exists");
}

function auditSnapshot(row: Candidate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AUDIT_DIFF_KEYS) {
    out[key] = row[key];
  }
  return out;
}

function auditDiff(
  prev: Candidate,
  next: Candidate,
): { prevState: Record<string, unknown>; nextState: Record<string, unknown> } {
  const prevState: Record<string, unknown> = {};
  const nextState: Record<string, unknown> = {};
  for (const key of AUDIT_DIFF_KEYS) {
    if (prev[key] === next[key]) continue;
    prevState[key] = prev[key];
    nextState[key] = next[key];
  }
  return { prevState, nextState };
}

function escapeIlikeTerm(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, "");
}

export function parseCandidateListQuery(
  searchParams: URLSearchParams,
): ListCandidatesQuery | CandidateErr {
  const qRaw = searchParams.get("q");
  const q = qRaw && qRaw.trim() ? qRaw.trim().slice(0, LIMITS.search) : null;

  const includeArchived =
    searchParams.get("include_archived") === "true" ||
    searchParams.get("include_archived") === "1";

  const consentParam = searchParams.get("consent_status");
  if (consentParam !== null && consentParam !== "") {
    if (!isConsentStatus(consentParam)) {
      return fail(
        400,
        `consent_status must be one of: ${CONSENT_STATUSES.join(", ")}`,
      );
    }
  }

  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const limit =
    limitParam === null || limitParam === ""
      ? 50
      : Number.parseInt(limitParam, 10);
  const offset =
    offsetParam === null || offsetParam === ""
      ? 0
      : Number.parseInt(offsetParam, 10);

  if (!Number.isFinite(limit) || limit < 1) {
    return fail(400, "limit must be a positive integer");
  }
  if (limit > 100) return fail(400, "limit must not exceed 100");
  if (!Number.isFinite(offset) || offset < 0) {
    return fail(400, "offset must be a non-negative integer");
  }

  return {
    ok: true,
    q,
    includeArchived,
    consentStatus:
      consentParam && consentParam.length > 0
        ? (consentParam as ConsentStatus)
        : null,
    limit,
    offset,
  };
}

export async function listCandidates(
  ctx: PeopleTenantContext,
  query: ListCandidatesQuery,
): Promise<CandidateListOk | CandidateErr> {
  let db = ctx.supabase
    .from("candidates")
    .select("*", { count: "exact" })
    .eq("team_id", ctx.teamId)
    .order("created_at", { ascending: false });

  if (!query.includeArchived) {
    db = db.is("archived_at", null);
  }
  if (query.consentStatus) {
    db = db.eq("consent_status", query.consentStatus);
  }
  if (query.q) {
    const term = escapeIlikeTerm(query.q);
    if (term) {
      db = db.or(
        `full_name.ilike."%${term}%",email.ilike."%${term}%",headline.ilike."%${term}%",current_role.ilike."%${term}%"`,
      );
    }
  }

  const rangeEnd = query.offset + query.limit - 1;
  const { data, error, count } = await db.range(query.offset, rangeEnd);

  if (error) return fail(500, error.message);
  const rows = (data ?? []) as Candidate[];
  return { ok: true, data: rows, count: count ?? rows.length };
}

export async function getCandidate(
  ctx: PeopleTenantContext,
  id: string,
): Promise<CandidateOk<Candidate> | CandidateErr> {
  const trimmed = id.trim();
  if (!trimmed) return fail(400, "Missing candidate id");

  const { data, error } = await ctx.supabase
    .from("candidates")
    .select("*")
    .eq("id", trimmed)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Candidate not found");
  return { ok: true, data: data as Candidate };
}

async function insertCandidate(
  ctx: PeopleTenantContext,
  fields: ParsedCreate,
  sourceMetadata: Record<string, unknown>,
): Promise<CandidateOk<Candidate> | CandidateErr> {
  const insert = {
    team_id: ctx.teamId,
    workspace_id: ctx.workspaceId,
    source_metadata: sourceMetadata,
    ...fields,
  };

  const { data, error } = await ctx.supabase
    .from("candidates")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    if (isUniqueEmailConflict(error)) return uniqueEmailError();
    return fail(500, error.message || "Failed to create candidate");
  }
  if (!data) return fail(500, "Failed to create candidate");

  const created = data as Candidate;
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "create",
    entityType: "candidate",
    entityId: created.id,
    prevState: null,
    nextState: auditSnapshot(created),
  });
  if (!audit.ok) return fail(500, audit.error);

  scheduleCandidateSummaryEmbed(ctx, created);
  return { ok: true, data: created };
}

function createBodyFromNormalized(
  record: NormalizedCandidate,
): Record<string, unknown> {
  return {
    full_name: record.full_name,
    email: record.email,
    phone: record.phone,
    headline: record.headline,
    current_role: record.current_role,
    experience_years: record.experience_years,
    skills: record.skills,
    location: record.location,
    source: record.source,
    source_url: record.source_url,
    consent_status: record.consent_status,
    notes: record.notes,
  };
}

/**
 * Persist a CandidateSource-normalized record.
 * HTTP create still rejects client-supplied source_metadata; this path is
 * adapter-only (H2 GitHub import will call it after fetch + normalize).
 */
export async function persistNormalizedCandidate(
  ctx: PeopleTenantContext,
  record: NormalizedCandidate,
): Promise<CandidateOk<Candidate> | CandidateErr> {
  if (!isCandidateSourceId(record.source)) {
    return fail(400, "Unknown candidate source");
  }

  const metadata = parseSourceMetadata(record.source_metadata);
  if (!metadata.ok) return fail(400, metadata.error);

  const parsed = parseCreateBody(createBodyFromNormalized(record));
  if (isErr(parsed)) return parsed;

  return insertCandidate(ctx, parsed.data, metadata.data);
}

export async function createCandidate(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<CandidateOk<Candidate> | CandidateErr> {
  const parsed = parseCreateBody(body);
  if (isErr(parsed)) return parsed;

  return insertCandidate(ctx, parsed.data, {});
}

export async function updateCandidate(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<CandidateOk<Candidate> | CandidateErr> {
  const existing = await getCandidate(ctx, id);
  if (!existing.ok) return existing;

  const parsed = parsePatchBody(body);
  if (isErr(parsed)) return parsed;

  const patch: Record<string, unknown> = { ...parsed.data.fields };
  if (parsed.data.archived === true) {
    patch.archived_at = existing.data.archived_at ?? new Date().toISOString();
  } else if (parsed.data.archived === false) {
    patch.archived_at = null;
  }

  const { data, error } = await ctx.supabase
    .from("candidates")
    .update(patch)
    .eq("id", existing.data.id)
    .eq("team_id", ctx.teamId)
    .select("*")
    .single();

  if (error) {
    if (isUniqueEmailConflict(error)) return uniqueEmailError();
    if (error.code === "PGRST116") return fail(404, "Candidate not found");
    return fail(500, error.message || "Failed to update candidate");
  }
  if (!data) return fail(404, "Candidate not found");

  const updated = data as Candidate;
  const { prevState, nextState } = auditDiff(existing.data, updated);
  const changed = Object.keys(nextState).length > 0;
  if (changed) {
    const archivedChanged = Object.prototype.hasOwnProperty.call(
      nextState,
      "archived_at",
    );
    const action = archivedChanged
      ? updated.archived_at
        ? "archive"
        : "unarchive"
      : "update";
    const audit = await writeAuditEvent(ctx, {
      domain: "people",
      action,
      entityType: "candidate",
      entityId: updated.id,
      prevState,
      nextState,
    });
    if (!audit.ok) return fail(500, audit.error);
  }

  if (changed) scheduleCandidateSummaryEmbed(ctx, updated);
  return { ok: true, data: updated };
}

const EMAIL_INDEX_PAGE = 500;
const EMAIL_INDEX_MAX_ROWS = 10_000;

/** Lowercased email → candidate id for non-archived rows in this tenant. */
export async function listActiveCandidateEmailIndex(
  ctx: PeopleTenantContext,
): Promise<{ ok: true; data: Map<string, string> } | CandidateErr> {
  const index = new Map<string, string>();
  let offset = 0;

  while (offset < EMAIL_INDEX_MAX_ROWS) {
    const { data, error } = await ctx.supabase
      .from("candidates")
      .select("id, email")
      .eq("team_id", ctx.teamId)
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + EMAIL_INDEX_PAGE - 1);

    if (error) return fail(500, error.message);
    const rows = (data ?? []) as { id: string; email: string | null }[];
    for (const row of rows) {
      if (typeof row.email !== "string") continue;
      const key = row.email.trim().toLowerCase();
      if (!key) continue;
      index.set(key, row.id);
    }
    if (rows.length < EMAIL_INDEX_PAGE) break;
    offset += EMAIL_INDEX_PAGE;
  }

  return { ok: true, data: index };
}

const EXPORT_PAGE = 500;
const EXPORT_MAX_ROWS = 10_000;

/** All non-archived candidates for CSV export (not the paginated list API). */
export async function listCandidatesForExport(
  ctx: PeopleTenantContext,
): Promise<CandidateListOk | CandidateErr> {
  const all: Candidate[] = [];
  let offset = 0;

  while (all.length < EXPORT_MAX_ROWS) {
    const { data, error } = await ctx.supabase
      .from("candidates")
      .select("*")
      .eq("team_id", ctx.teamId)
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .range(offset, offset + EXPORT_PAGE - 1);

    if (error) return fail(500, error.message);
    const rows = (data ?? []) as Candidate[];
    all.push(...rows);
    if (rows.length < EXPORT_PAGE) break;
    offset += EXPORT_PAGE;
  }

  return { ok: true, data: all, count: all.length };
}
