import "server-only";

import { writeAuditEvent } from "@/lib/audit";
import {
  CSV_DEFAULT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  EMPLOYEE_CSV_FIELDS,
  formatCsvImportSummary,
  planCsvImport,
  serializeCsv,
  utf8ByteLength,
  type CsvColumnMapping,
  type CsvImportPlan,
  type CsvImportSummary,
  type PlannedCsvRow,
} from "@/lib/csv";
import {
  createEmployee,
  listActiveEmployeeEmailIndex,
  listEmployeesForExport,
  updateEmployee,
  type EmployeeErr,
  type PeopleTenantContext,
} from "@/lib/people/employees";
import type { Employee } from "@/types";

export { formatCsvImportSummary };

export const EMPLOYEE_CSV_MAX_ROWS = CSV_IMPORT_MAX_ROWS;

const IMPORT_BODY_KEYS = ["csv", "mapping"] as const;
const EXPORT_HEADERS = EMPLOYEE_CSV_FIELDS.map((spec) => spec.name);

export type EmployeeCsvPreviewOk = CsvImportPlan;
export type EmployeeCsvImportOk = CsvImportPlan & {
  message: string;
};
export type EmployeeCsvExportOk = {
  ok: true;
  filename: string;
  csv: string;
};

function fail(status: number, error: string): EmployeeErr {
  return { ok: false, status, error };
}

function isErr(value: { ok?: boolean }): value is EmployeeErr {
  return value.ok === false;
}

function unknownKeys(body: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function parseMapping(
  raw: unknown,
): { ok: true; mapping?: CsvColumnMapping } | EmployeeErr {
  if (raw === undefined) return { ok: true, mapping: undefined };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail(400, "mapping must be an object");
  }

  const mapping: CsvColumnMapping = {};
  for (const [source, field] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof field !== "string") {
      return fail(400, "mapping values must be strings");
    }
    const trimmed = field.trim();
    if (!trimmed) continue;
    mapping[source] = trimmed;
  }
  return { ok: true, mapping };
}

export function parseEmployeeCsvBody(
  body: Record<string, unknown>,
): { ok: true; csv: string; mapping?: CsvColumnMapping } | EmployeeErr {
  const extra = unknownKeys(body, IMPORT_BODY_KEYS);
  if (extra.length > 0) {
    return fail(400, `Unexpected fields: ${extra.join(", ")}`);
  }
  if (typeof body.csv !== "string") {
    return fail(400, "csv is required");
  }
  const csv = body.csv;
  if (!csv.trim()) return fail(400, "csv is required");

  const mapping = parseMapping(body.mapping);
  if (isErr(mapping)) return mapping;
  return { ok: true, csv, mapping: mapping.mapping };
}

function identityKey(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function emptySummary(): CsvImportSummary {
  return { imported: 0, updated: 0, duplicates: 0, failed: 0 };
}

function recount(rows: PlannedCsvRow[]): CsvImportSummary {
  const summary = emptySummary();
  for (const row of rows) {
    if (row.action === "imported") summary.imported += 1;
    else if (row.action === "updated") summary.updated += 1;
    else if (row.action === "duplicate") summary.duplicates += 1;
    else summary.failed += 1;
  }
  return summary;
}

function collectErrors(rows: PlannedCsvRow[]) {
  return rows.flatMap((row) => row.errors);
}

function fileErrorStatus(error: string): number {
  if (/byte size limit|1 MB size limit/i.test(error)) return 413;
  return 400;
}

function mappedFieldNames(mapping: CsvColumnMapping): Set<string> {
  return new Set(Object.values(mapping));
}

function bodyFromPlannedRow(
  values: Record<string, unknown>,
  mapping: CsvColumnMapping,
  mode: "create" | "update",
): Record<string, unknown> {
  const mapped = mappedFieldNames(mapping);
  const body: Record<string, unknown> = {};
  for (const spec of EMPLOYEE_CSV_FIELDS) {
    if (mode === "update" && !mapped.has(spec.name)) continue;
    if (!Object.prototype.hasOwnProperty.call(values, spec.name)) continue;
    body[spec.name] = values[spec.name];
  }
  return body;
}

async function planForTenant(
  ctx: PeopleTenantContext,
  csv: string,
  mapping: CsvColumnMapping | undefined,
): Promise<CsvImportPlan | EmployeeErr> {
  if (utf8ByteLength(csv) > CSV_DEFAULT_MAX_BYTES) {
    return fail(413, "CSV exceeds the 1 MB size limit");
  }

  const index = await listActiveEmployeeEmailIndex(ctx);
  if (!index.ok) return index;

  const planned = planCsvImport({
    text: csv,
    profile: "employee",
    mapping,
    existingKeys: index.data.keys(),
    maxBytes: CSV_DEFAULT_MAX_BYTES,
    maxRows: EMPLOYEE_CSV_MAX_ROWS,
  });
  if (!planned.ok) {
    return fail(fileErrorStatus(planned.error), planned.error);
  }
  return planned;
}

export async function previewEmployeeCsv(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<EmployeeCsvPreviewOk | EmployeeErr> {
  const parsed = parseEmployeeCsvBody(body);
  if (isErr(parsed)) return parsed;
  return planForTenant(ctx, parsed.csv, parsed.mapping);
}

async function applyPlannedRow(
  ctx: PeopleTenantContext,
  row: PlannedCsvRow,
  mapping: CsvColumnMapping,
  emailIndex: Map<string, string>,
): Promise<PlannedCsvRow> {
  if (row.action === "failed" || row.action === "duplicate") {
    return row;
  }

  if (row.action === "imported") {
    const created = await createEmployee(
      ctx,
      bodyFromPlannedRow(row.values, mapping, "create"),
    );
    if (!created.ok) {
      return {
        ...row,
        action: "failed",
        errors: [{ row: row.row, message: created.error }],
      };
    }
    const key = identityKey(created.data.email);
    if (key) emailIndex.set(key, created.data.id);
    return row;
  }

  const key = identityKey(row.values.email);
  const id = key ? emailIndex.get(key) : undefined;
  if (!id) {
    return {
      ...row,
      action: "failed",
      errors: [{ row: row.row, message: "No existing employee matched this email" }],
    };
  }

  const updated = await updateEmployee(
    ctx,
    id,
    bodyFromPlannedRow(row.values, mapping, "update"),
  );
  if (!updated.ok) {
    return {
      ...row,
      action: "failed",
      errors: [{ row: row.row, message: updated.error }],
    };
  }
  return row;
}

export async function importEmployeeCsv(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<EmployeeCsvImportOk | EmployeeErr> {
  const parsed = parseEmployeeCsvBody(body);
  if (isErr(parsed)) return parsed;

  const index = await listActiveEmployeeEmailIndex(ctx);
  if (!index.ok) return index;

  if (utf8ByteLength(parsed.csv) > CSV_DEFAULT_MAX_BYTES) {
    return fail(413, "CSV exceeds the 1 MB size limit");
  }

  const planned = planCsvImport({
    text: parsed.csv,
    profile: "employee",
    mapping: parsed.mapping,
    existingKeys: index.data.keys(),
    maxBytes: CSV_DEFAULT_MAX_BYTES,
    maxRows: EMPLOYEE_CSV_MAX_ROWS,
  });
  if (!planned.ok) {
    return fail(fileErrorStatus(planned.error), planned.error);
  }

  const applied: PlannedCsvRow[] = [];
  for (const row of planned.rows) {
    applied.push(await applyPlannedRow(ctx, row, planned.mapping, index.data));
  }

  const summary = recount(applied);
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "import",
    entityType: "employee_csv",
    entityId: null,
    metadata: {
      imported: summary.imported,
      updated: summary.updated,
      duplicates: summary.duplicates,
      failed: summary.failed,
    },
  });
  if (!audit.ok) return fail(500, audit.error);

  return {
    ...planned,
    rows: applied,
    summary,
    errors: collectErrors(applied),
    message: formatCsvImportSummary(summary),
  };
}

function employeeExportCells(row: Employee): unknown[] {
  return EXPORT_HEADERS.map((name) => {
    const value = row[name as keyof Employee];
    return value ?? "";
  });
}

function exportFilename(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `employees-${year}-${month}-${day}.csv`;
}

export async function exportEmployeesCsv(
  ctx: PeopleTenantContext,
): Promise<EmployeeCsvExportOk | EmployeeErr> {
  const listed = await listEmployeesForExport(ctx);
  if (!listed.ok) return listed;

  const rows = listed.data.map((row) => employeeExportCells(row));
  return {
    ok: true,
    filename: exportFilename(),
    csv: serializeCsv(EXPORT_HEADERS, rows),
  };
}
