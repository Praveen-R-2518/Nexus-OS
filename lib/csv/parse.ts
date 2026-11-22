/**
 * RFC 4180 CSV tokenizer for People imports.
 * Pure functions only — no Next.js, no I/O, no DB.
 */

export const CSV_DEFAULT_MAX_BYTES = 1_000_000;

export const CSV_DELIMITERS = [",", ";", "\t"] as const;

export type CsvDelimiter = (typeof CSV_DELIMITERS)[number];

export type CsvParseOk = {
  ok: true;
  delimiter: CsvDelimiter;
  headers: string[];
  rows: string[][];
};

export type CsvParseErr = {
  ok: false;
  error: string;
};

export type CsvParseResult = CsvParseOk | CsvParseErr;

function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

function isDelimiterChar(ch: string): ch is CsvDelimiter {
  return ch === "," || ch === ";" || ch === "\t";
}

/**
 * Count candidate delimiters on the first physical record terminator,
 * ignoring characters inside quoted fields.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const source = stripBom(text);
  let inQuotes = false;
  let comma = 0;
  let semi = 0;
  let tab = 0;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') {
      if (inQuotes && source[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === "\n" || ch === "\r") break;
    if (ch === ",") comma += 1;
    else if (ch === ";") semi += 1;
    else if (ch === "\t") tab += 1;
  }

  if (tab > comma && tab > semi) return "\t";
  if (semi > comma) return ";";
  return ",";
}

type RecordsOk = { ok: true; records: string[][] };
type RecordsErr = { ok: false; error: string };

function parseRecords(source: string, delimiter: CsvDelimiter): RecordsOk | RecordsErr {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };

  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];

    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      pushField();
      continue;
    }

    if (ch === "\n") {
      pushRecord();
      continue;
    }

    if (ch === "\r") {
      if (source[i + 1] === "\n") i += 1;
      pushRecord();
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    return { ok: false, error: "Malformed CSV: unclosed quoted field" };
  }

  const endedOnRecordBreak =
    source.endsWith("\n") || source.endsWith("\r");
  if (!endedOnRecordBreak) {
    pushRecord();
  } else if (field.length > 0 || record.length > 0) {
    pushRecord();
  }

  return { ok: true, records };
}

function trimHeaders(raw: string[]): string[] {
  return raw.map((h) => h.trim());
}

function headerError(headers: string[]): string | null {
  if (headers.length === 0 || headers.every((h) => h.length === 0)) {
    return "CSV has no header row";
  }
  const seen = new Map<string, number>();
  for (const header of headers) {
    if (!header) return "CSV has an empty header column";
    const key = header.toLowerCase();
    const prev = seen.get(key);
    if (prev !== undefined) {
      return `CSV has duplicate header: ${header}`;
    }
    seen.set(key, 1);
  }
  return null;
}

function alignRow(cells: string[], width: number): string[] {
  if (cells.length === width) return cells;
  if (cells.length > width) return cells.slice(0, width);
  const padded = cells.slice();
  while (padded.length < width) padded.push("");
  return padded;
}

/**
 * Parse CSV text into headers + data rows.
 * The first record is the header. Data rows are padded/truncated to the header width.
 */
export function parseCsv(
  text: string,
  delimiter?: CsvDelimiter,
): CsvParseResult {
  if (typeof text !== "string") {
    return { ok: false, error: "CSV text is required" };
  }
  const source = stripBom(text);
  if (!source.trim()) {
    return { ok: false, error: "CSV is empty" };
  }

  const chosen = delimiter ?? detectDelimiter(source);
  if (!isDelimiterChar(chosen)) {
    return { ok: false, error: "Unsupported CSV delimiter" };
  }

  const parsed = parseRecords(source, chosen);
  if (!parsed.ok) return parsed;

  const records = parsed.records;
  if (records.length === 0) {
    return { ok: false, error: "CSV is empty" };
  }

  const headers = trimHeaders(records[0]);
  const headerProblem = headerError(headers);
  if (headerProblem) return { ok: false, error: headerProblem };

  const width = headers.length;
  const rows = records.slice(1).map((row) => alignRow(row, width));

  return { ok: true, delimiter: chosen, headers, rows };
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
