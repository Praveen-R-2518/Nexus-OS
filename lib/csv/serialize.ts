/**
 * RFC 4180 CSV encoder for People exports.
 * Pure functions only — no Next.js, no I/O, no DB.
 */

import { isCsvFormulaInjection } from "@/lib/csv/plan";

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

/**
 * Neutralize spreadsheet formulas on export. Phone-like `+9477…` is left alone
 * (same rule as import). Prefix a leading `'` so Excel/Sheets treat the rest as text.
 */
export function escapeCsvCell(value: unknown): string {
  let cell = cellToString(value);
  if (isCsvFormulaInjection(cell)) {
    cell = `'${cell}`;
  }

  const needsQuotes =
    /[",\n\r]/.test(cell) || cell.includes("\t") || cell.startsWith("'");
  if (!needsQuotes) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}

export function serializeCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines: string[] = [];
  lines.push(headers.map((h) => escapeCsvCell(h)).join(","));
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
