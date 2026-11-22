/**
 * Map CSV columns to a People profile and produce an in-memory import plan.
 * Never writes to the database — B4/C3 consume this plan.
 */

import {
  CSV_DEFAULT_MAX_BYTES,
  parseCsv,
  utf8ByteLength,
  type CsvDelimiter,
} from "@/lib/csv/parse";
import {
  fieldLookupKeys,
  getCsvProfile,
  normalizeHeaderKey,
  type CsvFieldSpec,
  type CsvProfile,
  type CsvProfileName,
} from "@/lib/csv/profiles";

/** People import row cap (B4/C3 pass this as maxRows). */
export const CSV_IMPORT_MAX_ROWS = 500;

/** sourceColumn → field name */
export type CsvColumnMapping = Record<string, string>;

export type CsvRowAction = "imported" | "updated" | "duplicate" | "failed";

export type CsvRowError = {
  row: number;
  field?: string;
  message: string;
};

export type PlannedCsvRow = {
  /** 1-based spreadsheet row (header is 1). */
  row: number;
  action: CsvRowAction;
  values: Record<string, unknown>;
  errors: CsvRowError[];
};

export type CsvImportSummary = {
  imported: number;
  updated: number;
  duplicates: number;
  failed: number;
};

export type CsvImportPlan = {
  ok: true;
  profile: CsvProfileName;
  delimiter: CsvDelimiter;
  headers: string[];
  mapping: CsvColumnMapping;
  summary: CsvImportSummary;
  rows: PlannedCsvRow[];
  errors: CsvRowError[];
};

export type CsvImportFileError = {
  ok: false;
  error: string;
};

export type CsvImportResult = CsvImportPlan | CsvImportFileError;

export type PlanCsvImportInput = {
  text: string;
  profile: CsvProfileName;
  mapping?: CsvColumnMapping;
  /** Lowercased emails already present in the tenant (B4/C3 pass these). */
  existingKeys?: Iterable<string>;
  maxBytes?: number;
  /** When set, more data rows than this (including blanks) is a file error. */
  maxRows?: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMULA_NEXT_RE = /[A-Za-z(!|]/;

export function suggestColumnMapping(
  headers: readonly string[],
  profileName: CsvProfileName,
): CsvColumnMapping {
  const profile = getCsvProfile(profileName);
  const unused = new Map<string, CsvFieldSpec>();
  for (const spec of profile.fields) {
    unused.set(spec.name, spec);
  }

  const mapping: CsvColumnMapping = {};
  for (const header of headers) {
    const key = normalizeHeaderKey(header);
    if (!key) continue;
    let matched: CsvFieldSpec | undefined;
    for (const spec of unused.values()) {
      if (fieldLookupKeys(spec).has(key)) {
        matched = spec;
        break;
      }
    }
    if (!matched) continue;
    mapping[header] = matched.name;
    unused.delete(matched.name);
  }
  return mapping;
}

function headerByNormalized(
  headers: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of headers) {
    map.set(header.trim().toLowerCase(), header);
  }
  return map;
}

function resolveMapping(
  headers: readonly string[],
  profile: CsvProfile,
  requested: CsvColumnMapping | undefined,
): { ok: true; mapping: CsvColumnMapping } | { ok: false; error: string } {
  const mapping =
    requested ??
    suggestColumnMapping(headers, profile.name);

  const headerLookup = headerByNormalized(headers);
  const fieldNames = new Set(profile.fields.map((f) => f.name));
  const usedFields = new Set<string>();
  const resolved: CsvColumnMapping = {};

  for (const [source, field] of Object.entries(mapping)) {
    if (!fieldNames.has(field)) {
      return { ok: false, error: `Unknown field in mapping: ${field}` };
    }
    const header = headerLookup.get(source.trim().toLowerCase());
    if (!header) {
      return { ok: false, error: `Mapped column not in CSV: ${source}` };
    }
    if (usedFields.has(field)) {
      return { ok: false, error: `Field mapped more than once: ${field}` };
    }
    usedFields.add(field);
    resolved[header] = field;
  }

  const missingRequired = profile.fields
    .filter((f) => f.required && !usedFields.has(f.name))
    .map((f) => f.name);
  if (missingRequired.length > 0) {
    return {
      ok: false,
      error: `Missing required columns: ${missingRequired.join(", ")}`,
    };
  }

  return { ok: true, mapping: resolved };
}

/**
 * Spreadsheet formula injection: cells that would execute in Excel/Sheets.
 * Phone numbers like +9477… are allowed (`+` then a digit).
 */
export function isCsvFormulaInjection(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const first = trimmed[0];
  if (first === "=" || first === "@") return true;
  if (first !== "+" && first !== "-") return false;
  const rest = trimmed.slice(1).trimStart();
  if (!rest) return false;
  return FORMULA_NEXT_RE.test(rest[0]);
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

function splitSkills(raw: string): string[] {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[;,]/)) {
    const skill = part.trim();
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(skill);
  }
  return items;
}

type CoerceOk = { ok: true; value: unknown };
type CoerceErr = { ok: false; message: string };

function coerceField(spec: CsvFieldSpec, raw: string): CoerceOk | CoerceErr {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (spec.required) {
      return { ok: false, message: `${spec.name} is required` };
    }
    if (spec.kind === "string_list") return { ok: true, value: [] };
    if (spec.defaultWhenBlank !== undefined) {
      return { ok: true, value: spec.defaultWhenBlank };
    }
    return { ok: true, value: null };
  }

  if (spec.maxLength !== undefined && trimmed.length > spec.maxLength) {
    return {
      ok: false,
      message: `${spec.name} exceeds ${spec.maxLength} characters`,
    };
  }

  switch (spec.kind) {
    case "text":
      return { ok: true, value: trimmed };
    case "email": {
      if (!EMAIL_RE.test(trimmed)) {
        return { ok: false, message: "email is invalid" };
      }
      return { ok: true, value: trimmed };
    }
    case "date": {
      if (!isIsoDate(trimmed)) {
        return { ok: false, message: `${spec.name} must be a YYYY-MM-DD date` };
      }
      return { ok: true, value: trimmed };
    }
    case "enum": {
      const normalized = trimmed.toLowerCase();
      const allowed = spec.enumValues ?? [];
      if (!allowed.includes(normalized as never)) {
        return {
          ok: false,
          message: `${spec.name} must be one of: ${allowed.join(", ")}`,
        };
      }
      return { ok: true, value: normalized };
    }
    case "number": {
      const num = Number(trimmed);
      if (!Number.isFinite(num) || num < 0) {
        return { ok: false, message: `${spec.name} must be a number 0 or greater` };
      }
      return { ok: true, value: num };
    }
    case "string_list":
      return { ok: true, value: splitSkills(trimmed) };
    default:
      return { ok: false, message: `${spec.name} has an unknown field kind` };
  }
}

function rowIsEmpty(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

function emptySummary(): CsvImportSummary {
  return { imported: 0, updated: 0, duplicates: 0, failed: 0 };
}

export function formatCsvImportSummary(summary: CsvImportSummary): string {
  return `${summary.imported} imported / ${summary.updated} updated / ${summary.duplicates} duplicates / ${summary.failed} failed`;
}

function countSummary(rows: PlannedCsvRow[]): CsvImportSummary {
  const summary = emptySummary();
  for (const row of rows) {
    if (row.action === "imported") summary.imported += 1;
    else if (row.action === "updated") summary.updated += 1;
    else if (row.action === "duplicate") summary.duplicates += 1;
    else summary.failed += 1;
  }
  return summary;
}

function collectRowErrors(rows: PlannedCsvRow[]): CsvRowError[] {
  const errors: CsvRowError[] = [];
  for (const row of rows) {
    errors.push(...row.errors);
  }
  return errors;
}

function identityKey(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

function existingKeySet(existingKeys: Iterable<string> | undefined): Set<string> {
  const set = new Set<string>();
  if (!existingKeys) return set;
  for (const key of existingKeys) {
    const normalized = key.trim().toLowerCase();
    if (normalized) set.add(normalized);
  }
  return set;
}

function specByName(profile: CsvProfile): Map<string, CsvFieldSpec> {
  const map = new Map<string, CsvFieldSpec>();
  for (const spec of profile.fields) map.set(spec.name, spec);
  return map;
}

function applyUnmappedDefaults(
  profile: CsvProfile,
  mappedFields: Set<string>,
  values: Record<string, unknown>,
): void {
  for (const spec of profile.fields) {
    if (mappedFields.has(spec.name)) continue;
    if (spec.kind === "string_list") {
      values[spec.name] = [];
      continue;
    }
    if (spec.defaultWhenBlank !== undefined) {
      values[spec.name] = spec.defaultWhenBlank;
      continue;
    }
    values[spec.name] = null;
  }
}

export function planCsvImport(input: PlanCsvImportInput): CsvImportResult {
  const maxBytes = input.maxBytes ?? CSV_DEFAULT_MAX_BYTES;
  if (typeof input.text !== "string") {
    return { ok: false, error: "CSV text is required" };
  }
  if (utf8ByteLength(input.text) > maxBytes) {
    return {
      ok: false,
      error: `CSV exceeds the ${maxBytes} byte size limit`,
    };
  }

  const parsed = parseCsv(input.text);
  if (!parsed.ok) return parsed;

  if (
    typeof input.maxRows === "number" &&
    Number.isFinite(input.maxRows) &&
    input.maxRows >= 0 &&
    parsed.rows.length > input.maxRows
  ) {
    return {
      ok: false,
      error: `CSV exceeds the ${input.maxRows} row limit`,
    };
  }

  const profile = getCsvProfile(input.profile);
  const mappingResult = resolveMapping(parsed.headers, profile, input.mapping);
  if (!mappingResult.ok) return mappingResult;

  const mapping = mappingResult.mapping;
  const specs = specByName(profile);
  const fieldToHeader = new Map<string, string>();
  for (const [header, field] of Object.entries(mapping)) {
    fieldToHeader.set(field, header);
  }
  const mappedFields = new Set(fieldToHeader.keys());
  const headerIndex = new Map<string, number>();
  parsed.headers.forEach((header, i) => headerIndex.set(header, i));

  const seenKeys = new Set<string>();
  const existing = existingKeySet(input.existingKeys);
  const planned: PlannedCsvRow[] = [];

  for (let i = 0; i < parsed.rows.length; i += 1) {
    const cells = parsed.rows[i];
    const sheetRow = i + 2;
    if (rowIsEmpty(cells)) continue;

    const values: Record<string, unknown> = {};
    const errors: CsvRowError[] = [];

    for (const [header, field] of Object.entries(mapping)) {
      const spec = specs.get(field);
      if (!spec) continue;
      const col = headerIndex.get(header);
      const raw = col === undefined ? "" : cells[col] ?? "";

      if (isCsvFormulaInjection(raw)) {
        errors.push({
          row: sheetRow,
          field,
          message: `${field} looks like a spreadsheet formula and was rejected`,
        });
        continue;
      }

      const coerced = coerceField(spec, raw);
      if (!coerced.ok) {
        errors.push({ row: sheetRow, field, message: coerced.message });
        continue;
      }
      values[field] = coerced.value;
    }

    applyUnmappedDefaults(profile, mappedFields, values);

    if (errors.length > 0) {
      planned.push({ row: sheetRow, action: "failed", values, errors });
      continue;
    }

    const key = identityKey(values[profile.identityField]);
    if (key && seenKeys.has(key)) {
      planned.push({
        row: sheetRow,
        action: "duplicate",
        values,
        errors: [],
      });
      continue;
    }
    if (key) seenKeys.add(key);

    const action: CsvRowAction =
      key && existing.has(key) ? "updated" : "imported";
    planned.push({ row: sheetRow, action, values, errors: [] });
  }

  return {
    ok: true,
    profile: profile.name,
    delimiter: parsed.delimiter,
    headers: parsed.headers,
    mapping,
    summary: countSummary(planned),
    rows: planned,
    errors: collectRowErrors(planned),
  };
}
