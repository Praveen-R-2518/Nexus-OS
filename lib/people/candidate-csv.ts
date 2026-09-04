import "server-only";

import { writeAuditEvent } from "@/lib/audit";
import {
  CANDIDATE_CSV_FIELDS,
  CSV_DEFAULT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  formatCsvImportSummary,
  planCsvImport,
  serializeCsv,
  utf8ByteLength,
  type CsvColumnMapping,
  type CsvImportPlan,
  type CsvImportSummary,
  type PlannedCsvRow,
} from "@/lib/csv";
import { enqueuePeopleMatchJob } from "@/lib/people/background-jobs";
import { ensureCandidateJobLink } from "@/lib/people/candidate-jobs";
import {
  createCandidate,
  listActiveCandidateEmailIndex,
  listCandidatesForExport,
  updateCandidate,
  type CandidateErr,
} from "@/lib/people/candidates";
import type { PeopleTenantContext } from "@/lib/people/employees";
import { getJob } from "@/lib/people/jobs";
import type { Candidate } from "@/types";

export { formatCsvImportSummary };

export const CANDIDATE_CSV_MAX_ROWS = CSV_IMPORT_MAX_ROWS;

const IMPORT_BODY_KEYS = ["csv", "mapping", "job_id"] as const;

export type CandidateCsvPreviewOk = CsvImportPlan;
export type CandidateCsvImportOk = CsvImportPlan & {
  message: string;
  attached: number;
};
export type CandidateCsvExportOk = {
  ok: true;
  filename: string;
  csv: string;
};

const EXPORT_HEADERS = CANDIDATE_CSV_FIELDS.map((spec) => spec.name);

function fail(status: number, error: string): CandidateErr {
  return { ok: false, status, error };
}

function isErr(value: { ok?: boolean }): value is CandidateErr {
  return value.ok === false;
}

function unknownKeys(body: Record<string, unknown>, allowed: readonly string[]): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function parseMapping(
  raw: unknown,
): { ok: true; mapping?: CsvColumnMapping } | CandidateErr {
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

function parseJobId(raw: unknown): { ok: true; jobId: string } | CandidateErr {
  if (typeof raw !== "string") return fail(400, "job_id is required");
  const jobId = raw.trim();
  if (!jobId) return fail(400, "job_id is required");
  return { ok: true, jobId };
}

export function parseCandidateCsvBody(
  body: Record<string, unknown>,
): { ok: true; csv: string; mapping?: CsvColumnMapping; jobId: string } | CandidateErr {
  const extra = unknownKeys(body, IMPORT_BODY_KEYS);
  if (extra.length > 0) {
    return fail(400, `Unexpected fields: ${extra.join(", ")}`);
  }
  if (typeof body.csv !== "string") {
    return fail(400, "csv is required");
  }
  const csv = body.csv;
  if (!csv.trim()) return fail(400, "csv is required");

  const jobId = parseJobId(body.job_id);
  if (isErr(jobId)) return jobId;

  const mapping = parseMapping(body.mapping);
  if (isErr(mapping)) return mapping;
  return { ok: true, csv, mapping: mapping.mapping, jobId: jobId.jobId };
}

async function resolveImportJob(
  ctx: PeopleTenantContext,
  jobId: string,
): Promise<{ ok: true; jobId: string } | CandidateErr> {
  const job = await getJob(ctx, jobId);
  if (!job.ok) return job;
  if (job.data.archived_at) {
    return fail(400, "Cannot import candidates onto an archived job");
  }
  return { ok: true, jobId: job.data.id };
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
  for (const spec of CANDIDATE_CSV_FIELDS) {
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
): Promise<CsvImportPlan | CandidateErr> {
  if (utf8ByteLength(csv) > CSV_DEFAULT_MAX_BYTES) {
    return fail(413, "CSV exceeds the 1 MB size limit");
  }

  const index = await listActiveCandidateEmailIndex(ctx);
  if (!index.ok) return index;

  const planned = planCsvImport({
    text: csv,
    profile: "candidate",
    mapping,
    existingKeys: index.data.keys(),
    maxBytes: CSV_DEFAULT_MAX_BYTES,
    maxRows: CANDIDATE_CSV_MAX_ROWS,
  });
  if (!planned.ok) {
    return fail(fileErrorStatus(planned.error), planned.error);
  }
  return planned;
}

export async function previewCandidateCsv(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<CandidateCsvPreviewOk | CandidateErr> {
  const parsed = parseCandidateCsvBody(body);
  if (isErr(parsed)) return parsed;

  const job = await resolveImportJob(ctx, parsed.jobId);
  if (isErr(job)) return job;

  return planForTenant(ctx, parsed.csv, parsed.mapping);
}

async function applyPlannedRow(
  ctx: PeopleTenantContext,
  row: PlannedCsvRow,
  mapping: CsvColumnMapping,
  emailIndex: Map<string, string>,
  jobId: string,
): Promise<{ row: PlannedCsvRow; attached: number }> {
  if (row.action === "failed" || row.action === "duplicate") {
    return { row, attached: 0 };
  }

  let candidateId: string | undefined;

  if (row.action === "imported") {
    const created = await createCandidate(
      ctx,
      bodyFromPlannedRow(row.values, mapping, "create"),
    );
    if (!created.ok) {
      return {
        row: {
          ...row,
          action: "failed",
          errors: [{ row: row.row, message: created.error }],
        },
        attached: 0,
      };
    }
    candidateId = created.data.id;
    const key = identityKey(created.data.email);
    if (key) emailIndex.set(key, created.data.id);
  } else {
    const key = identityKey(row.values.email);
    const id = key ? emailIndex.get(key) : undefined;
    if (!id) {
      return {
        row: {
          ...row,
          action: "failed",
          errors: [
            {
              row: row.row,
              message: "No existing candidate matched this email",
            },
          ],
        },
        attached: 0,
      };
    }

    const updated = await updateCandidate(
      ctx,
      id,
      bodyFromPlannedRow(row.values, mapping, "update"),
    );
    if (!updated.ok) {
      return {
        row: {
          ...row,
          action: "failed",
          errors: [{ row: row.row, message: updated.error }],
        },
        attached: 0,
      };
    }
    candidateId = updated.data.id;
  }

  const link = await ensureCandidateJobLink(ctx, candidateId, jobId);
  if (!link.ok) {
    return {
      row: {
        ...row,
        action: "failed",
        errors: [{ row: row.row, message: link.error }],
      },
      attached: 0,
    };
  }

  return { row, attached: link.attached ? 1 : 0 };
}

export async function importCandidateCsv(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<CandidateCsvImportOk | CandidateErr> {
  const parsed = parseCandidateCsvBody(body);
  if (isErr(parsed)) return parsed;

  const job = await resolveImportJob(ctx, parsed.jobId);
  if (isErr(job)) return job;

  const index = await listActiveCandidateEmailIndex(ctx);
  if (!index.ok) return index;

  if (utf8ByteLength(parsed.csv) > CSV_DEFAULT_MAX_BYTES) {
    return fail(413, "CSV exceeds the 1 MB size limit");
  }

  const planned = planCsvImport({
    text: parsed.csv,
    profile: "candidate",
    mapping: parsed.mapping,
    existingKeys: index.data.keys(),
    maxBytes: CSV_DEFAULT_MAX_BYTES,
    maxRows: CANDIDATE_CSV_MAX_ROWS,
  });
  if (!planned.ok) {
    return fail(fileErrorStatus(planned.error), planned.error);
  }

  const applied: PlannedCsvRow[] = [];
  let attached = 0;
  for (const row of planned.rows) {
    const result = await applyPlannedRow(
      ctx,
      row,
      planned.mapping,
      index.data,
      job.jobId,
    );
    applied.push(result.row);
    attached += result.attached;
  }

  const summary = recount(applied);
  const audit = await writeAuditEvent(ctx, {
    domain: "people",
    action: "import",
    entityType: "candidate_csv",
    entityId: job.jobId,
    metadata: {
      imported: summary.imported,
      updated: summary.updated,
      duplicates: summary.duplicates,
      failed: summary.failed,
      attached,
    },
  });
  if (!audit.ok) return fail(500, audit.error);

  const matchJob = await enqueuePeopleMatchJob(ctx, job.jobId);
  if (!matchJob.ok) return fail(500, matchJob.error);

  return {
    ...planned,
    rows: applied,
    summary,
    errors: collectErrors(applied),
    attached,
    message: formatCsvImportSummary(summary),
  };
}

function candidateExportCells(row: Candidate): unknown[] {
  return EXPORT_HEADERS.map((name) => {
    const value = row[name as keyof Candidate];
    return value ?? "";
  });
}

function exportFilename(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `candidates-${year}-${month}-${day}.csv`;
}

export async function exportCandidatesCsv(
  ctx: PeopleTenantContext,
): Promise<CandidateCsvExportOk | CandidateErr> {
  const listed = await listCandidatesForExport(ctx);
  if (!listed.ok) return listed;

  const rows = listed.data.map((row) => candidateExportCells(row));
  return {
    ok: true,
    filename: exportFilename(),
    csv: serializeCsv(EXPORT_HEADERS, rows),
  };
}
