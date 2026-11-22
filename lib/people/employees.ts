import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditEvent } from "@/lib/audit";
import { scheduleEmployeeSummaryEmbed } from "@/lib/people/embed";
import {
  EMPLOYMENT_STATUSES,
  type Employee,
  type EmploymentStatus,
} from "@/types";

export { EMPLOYMENT_STATUSES };

const CREATE_FIELDS = [
  "full_name",
  "email",
  "phone",
  "role_title",
  "employment_status",
  "started_on",
  "ended_on",
  "location",
  "notes",
] as const;

const PATCH_FIELDS = [...CREATE_FIELDS, "archived"] as const;

const LIMITS = {
  full_name: 250,
  email: 320,
  phone: 80,
  role_title: 250,
  location: 250,
  notes: 10_000,
  search: 200,
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUDIT_DIFF_KEYS = [
  "full_name",
  "email",
  "phone",
  "role_title",
  "employment_status",
  "started_on",
  "ended_on",
  "location",
  "archived_at",
] as const;

export type PeopleTenantContext = {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
  user: { id: string };
};

export type EmployeeErr = { ok: false; status: number; error: string };
export type EmployeeOk<T> = { ok: true; data: T };
export type EmployeeListOk = { ok: true; data: Employee[]; count: number };

export type ListEmployeesQuery = {
  ok: true;
  q: string | null;
  includeArchived: boolean;
  employmentStatus: string | null;
  limit: number;
  offset: number;
};

type ParsedCreate = {
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  employment_status: EmploymentStatus;
  started_on: string | null;
  ended_on: string | null;
  location: string | null;
  notes: string | null;
};

type ParsedPatch = {
  fields: Partial<Omit<ParsedCreate, "full_name">> & { full_name?: string };
  archived?: boolean;
};

function fail(status: number, error: string): EmployeeErr {
  return { ok: false, status, error };
}

function isErr(value: { ok?: boolean }): value is EmployeeErr {
  return value.ok === false;
}

function unknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function extraFieldsError(keys: string[]): EmployeeErr {
  return fail(400, `Unexpected fields: ${keys.join(", ")}`);
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isEmploymentStatus(value: unknown): value is EmploymentStatus {
  return (
    typeof value === "string" &&
    EMPLOYMENT_STATUSES.includes(value as EmploymentStatus)
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

function parseOptionalDate(
  body: Record<string, unknown>,
  key: string,
): { ok: true; value: string | null | undefined } | EmployeeErr {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { ok: true, value: undefined };
  }
  const raw = body[key];
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return fail(400, `${key} must be a YYYY-MM-DD date or null`);
  }
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!isIsoDate(trimmed)) {
    return fail(400, `${key} must be a YYYY-MM-DD date or null`);
  }
  return { ok: true, value: trimmed };
}

function parseOptionalEmail(
  body: Record<string, unknown>,
): { ok: true; value: string | null | undefined } | EmployeeErr {
  if (!Object.prototype.hasOwnProperty.call(body, "email")) {
    return { ok: true, value: undefined };
  }
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
  key: "phone" | "role_title" | "location" | "notes",
): { ok: true; value: string | null | undefined } | EmployeeErr {
  if (!Object.prototype.hasOwnProperty.call(body, key)) {
    return { ok: true, value: undefined };
  }
  const raw = body[key];
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return fail(400, `${key} must be a string or null`);
  return { ok: true, value: boundedString(raw, LIMITS[key]) };
}

function parseEmploymentStatus(
  body: Record<string, unknown>,
  required: boolean,
): { ok: true; value: EmploymentStatus | undefined } | EmployeeErr {
  if (!Object.prototype.hasOwnProperty.call(body, "employment_status")) {
    if (required) return { ok: true, value: "active" };
    return { ok: true, value: undefined };
  }
  if (!isEmploymentStatus(body.employment_status)) {
    return fail(
      400,
      `employment_status must be one of: ${EMPLOYMENT_STATUSES.join(", ")}`,
    );
  }
  return { ok: true, value: body.employment_status };
}

function parseCreateBody(
  body: Record<string, unknown>,
): { ok: true; data: ParsedCreate } | EmployeeErr {
  const extra = unknownKeys(body, CREATE_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const fullName = boundedString(body.full_name, LIMITS.full_name);
  if (!fullName) return fail(400, "full_name is required");

  const email = parseOptionalEmail(body);
  if (isErr(email)) return email;
  const phone = parseOptionalText(body, "phone");
  if (isErr(phone)) return phone;
  const roleTitle = parseOptionalText(body, "role_title");
  if (isErr(roleTitle)) return roleTitle;
  const location = parseOptionalText(body, "location");
  if (isErr(location)) return location;
  const notes = parseOptionalText(body, "notes");
  if (isErr(notes)) return notes;
  const startedOn = parseOptionalDate(body, "started_on");
  if (isErr(startedOn)) return startedOn;
  const endedOn = parseOptionalDate(body, "ended_on");
  if (isErr(endedOn)) return endedOn;
  const status = parseEmploymentStatus(body, true);
  if (isErr(status)) return status;

  return {
    ok: true,
    data: {
      full_name: fullName,
      email: email.value ?? null,
      phone: phone.value ?? null,
      role_title: roleTitle.value ?? null,
      employment_status: status.value ?? "active",
      started_on: startedOn.value ?? null,
      ended_on: endedOn.value ?? null,
      location: location.value ?? null,
      notes: notes.value ?? null,
    },
  };
}

function parsePatchBody(
  body: Record<string, unknown>,
): { ok: true; data: ParsedPatch } | EmployeeErr {
  const extra = unknownKeys(body, PATCH_FIELDS);
  if (extra.length > 0) return extraFieldsError(extra);

  const fields: ParsedPatch["fields"] = {};

  if (Object.prototype.hasOwnProperty.call(body, "full_name")) {
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

  const roleTitle = parseOptionalText(body, "role_title");
  if (isErr(roleTitle)) return roleTitle;
  if (roleTitle.value !== undefined) fields.role_title = roleTitle.value;

  const location = parseOptionalText(body, "location");
  if (isErr(location)) return location;
  if (location.value !== undefined) fields.location = location.value;

  const notes = parseOptionalText(body, "notes");
  if (isErr(notes)) return notes;
  if (notes.value !== undefined) fields.notes = notes.value;

  const startedOn = parseOptionalDate(body, "started_on");
  if (isErr(startedOn)) return startedOn;
  if (startedOn.value !== undefined) fields.started_on = startedOn.value;

  const endedOn = parseOptionalDate(body, "ended_on");
  if (isErr(endedOn)) return endedOn;
  if (endedOn.value !== undefined) fields.ended_on = endedOn.value;

  const status = parseEmploymentStatus(body, false);
  if (isErr(status)) return status;
  if (status.value !== undefined) fields.employment_status = status.value;

  let archived: boolean | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "archived")) {
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
  return message.includes("employees_team_lower_email_active_uidx");
}

function uniqueEmailError(): EmployeeErr {
  return fail(409, "An employee with this email already exists");
}

function auditSnapshot(row: Employee): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of AUDIT_DIFF_KEYS) {
    out[key] = row[key];
  }
  return out;
}

function auditDiff(
  prev: Employee,
  next: Employee,
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

export function parseListQuery(searchParams: URLSearchParams): ListEmployeesQuery | EmployeeErr {
  const qRaw = searchParams.get("q");
  const q = qRaw && qRaw.trim() ? qRaw.trim().slice(0, LIMITS.search) : null;

  const includeArchived =
    searchParams.get("include_archived") === "true" ||
    searchParams.get("include_archived") === "1";

  const statusParam = searchParams.get("employment_status");
  if (statusParam !== null && statusParam !== "") {
    if (!isEmploymentStatus(statusParam)) {
      return fail(
        400,
        `employment_status must be one of: ${EMPLOYMENT_STATUSES.join(", ")}`,
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
    employmentStatus: statusParam && statusParam.length > 0 ? statusParam : null,
    limit,
    offset,
  };
}

export async function listEmployees(
  ctx: PeopleTenantContext,
  query: ListEmployeesQuery,
): Promise<EmployeeListOk | EmployeeErr> {
  const limit = query.limit;
  const offset = query.offset;

  let db = ctx.supabase
    .from("employees")
    .select("*", { count: "exact" })
    .eq("team_id", ctx.teamId)
    .order("created_at", { ascending: false });

  if (!query.includeArchived) {
    db = db.is("archived_at", null);
  }
  if (query.employmentStatus) {
    db = db.eq("employment_status", query.employmentStatus);
  }
  if (query.q) {
    const term = escapeIlikeTerm(query.q);
    if (term) {
      db = db.or(`full_name.ilike."%${term}%",email.ilike."%${term}%"`);
    }
  }

  const rangeEnd = offset + limit - 1;
  const { data, error, count } = await db.range(offset, rangeEnd);

  if (error) return fail(500, error.message);
  const rows = (data ?? []) as Employee[];
  return { ok: true, data: rows, count: count ?? rows.length };
}

export async function getEmployee(
  ctx: PeopleTenantContext,
  id: string,
): Promise<EmployeeOk<Employee> | EmployeeErr> {
  const trimmed = id.trim();
  if (!trimmed) return fail(400, "Missing employee id");

  const { data, error } = await ctx.supabase
    .from("employees")
    .select("*")
    .eq("id", trimmed)
    .eq("team_id", ctx.teamId)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return fail(404, "Employee not found");
  return { ok: true, data: data as Employee };
}

export async function createEmployee(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<EmployeeOk<Employee> | EmployeeErr> {
  const parsed = parseCreateBody(body);
  if (isErr(parsed)) return parsed;
  const insert = {
    team_id: ctx.teamId,
    workspace_id: ctx.workspaceId,
    ...parsed.data,
  };

  const { data, error } = await ctx.supabase
    .from("employees")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    if (isUniqueEmailConflict(error)) return uniqueEmailError();
    return fail(500, error.message || "Failed to create employee");
  }
  if (!data) return fail(500, "Failed to create employee");

  const created = data as Employee;
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "create",
    entityType: "employee",
    entityId: created.id,
    prevState: null,
    nextState: auditSnapshot(created),
  });
  if (!audit.ok) return fail(500, audit.error);

  scheduleEmployeeSummaryEmbed(ctx, created);
  return { ok: true, data: created };
}

export async function updateEmployee(
  ctx: PeopleTenantContext,
  id: string,
  body: Record<string, unknown>,
): Promise<EmployeeOk<Employee> | EmployeeErr> {
  const existing = await getEmployee(ctx, id);
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
    .from("employees")
    .update(patch)
    .eq("id", existing.data.id)
    .eq("team_id", ctx.teamId)
    .select("*")
    .single();

  if (error) {
    if (isUniqueEmailConflict(error)) return uniqueEmailError();
    if (error.code === "PGRST116") return fail(404, "Employee not found");
    return fail(500, error.message || "Failed to update employee");
  }
  if (!data) return fail(404, "Employee not found");

  const updated = data as Employee;
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
      entityType: "employee",
      entityId: updated.id,
      prevState,
      nextState,
    });
    if (!audit.ok) return fail(500, audit.error);
  }

  if (changed) scheduleEmployeeSummaryEmbed(ctx, updated);
  return { ok: true, data: updated };
}

const EMAIL_INDEX_PAGE = 500;
const EXPORT_PAGE = 500;
const EXPORT_MAX_ROWS = 10_000;

/** Lowercased email → employee id for non-archived rows in this tenant. */
export async function listActiveEmployeeEmailIndex(
  ctx: PeopleTenantContext,
): Promise<{ ok: true; data: Map<string, string> } | EmployeeErr> {
  const index = new Map<string, string>();
  let offset = 0;

  while (offset < EXPORT_MAX_ROWS) {
    const { data, error } = await ctx.supabase
      .from("employees")
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

/** All non-archived employees for CSV export (not the paginated list API). */
export async function listEmployeesForExport(
  ctx: PeopleTenantContext,
): Promise<EmployeeListOk | EmployeeErr> {
  const all: Employee[] = [];
  let offset = 0;

  while (all.length < EXPORT_MAX_ROWS) {
    const { data, error } = await ctx.supabase
      .from("employees")
      .select("*")
      .eq("team_id", ctx.teamId)
      .is("archived_at", null)
      .order("full_name", { ascending: true })
      .range(offset, offset + EXPORT_PAGE - 1);

    if (error) return fail(500, error.message);
    const rows = (data ?? []) as Employee[];
    all.push(...rows);
    if (rows.length < EXPORT_PAGE) break;
    offset += EXPORT_PAGE;
  }

  return { ok: true, data: all, count: all.length };
}
