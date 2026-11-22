/**
 * People CSV field dictionaries (employee + candidate).
 * Keep this module free of Next.js / server-only imports so tests stay pure.
 */

import {
  CONSENT_STATUSES,
  EMPLOYMENT_STATUSES,
  type ConsentStatus,
} from "@/types";

export { CONSENT_STATUSES };
export type { ConsentStatus };

export type CsvProfileName = "employee" | "candidate";

export type CsvValueKind =
  | "text"
  | "email"
  | "date"
  | "enum"
  | "number"
  | "string_list";

export type CsvFieldSpec = {
  name: string;
  required: boolean;
  kind: CsvValueKind;
  /** Max UTF-16 length of the trimmed cell (not used for number). */
  maxLength?: number;
  /** Human-readable header aliases; matched after punctuation is stripped. */
  aliases: readonly string[];
  enumValues?: readonly string[];
  /** Applied when the mapped cell is blank. */
  defaultWhenBlank?: string | null;
};

/** Match B1 employee field limits (`lib/people/employees.ts`). */
export const CSV_FIELD_LIMITS = {
  full_name: 250,
  email: 320,
  phone: 80,
  role_title: 250,
  location: 250,
  notes: 10_000,
  headline: 250,
  current_role: 250,
  source: 120,
  source_url: 2000,
} as const;

const SHARED_IDENTITY_ALIASES = {
  full_name: ["name", "full name", "employee name", "candidate name", "fullname"],
  email: ["e-mail", "email address", "mail", "e mail"],
  phone: ["mobile", "telephone", "tel", "phone number", "cell"],
  location: ["loc", "city", "office", "based in"],
  notes: ["note", "comments", "comment", "remarks"],
} as const;

export const EMPLOYEE_CSV_FIELDS: readonly CsvFieldSpec[] = [
  {
    name: "full_name",
    required: true,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.full_name,
    aliases: SHARED_IDENTITY_ALIASES.full_name,
  },
  {
    name: "email",
    required: false,
    kind: "email",
    maxLength: CSV_FIELD_LIMITS.email,
    aliases: SHARED_IDENTITY_ALIASES.email,
  },
  {
    name: "phone",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.phone,
    aliases: SHARED_IDENTITY_ALIASES.phone,
  },
  {
    name: "role_title",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.role_title,
    aliases: ["role", "title", "job title", "position", "job"],
  },
  {
    name: "employment_status",
    required: false,
    kind: "enum",
    aliases: ["status", "employment status", "employment"],
    enumValues: EMPLOYMENT_STATUSES,
    defaultWhenBlank: "active",
  },
  {
    name: "started_on",
    required: false,
    kind: "date",
    aliases: ["start date", "started", "start", "hire date", "joined"],
  },
  {
    name: "ended_on",
    required: false,
    kind: "date",
    aliases: ["end date", "ended", "end", "leave date", "left"],
  },
  {
    name: "location",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.location,
    aliases: SHARED_IDENTITY_ALIASES.location,
  },
  {
    name: "notes",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.notes,
    aliases: SHARED_IDENTITY_ALIASES.notes,
  },
];

export const CANDIDATE_CSV_FIELDS: readonly CsvFieldSpec[] = [
  {
    name: "full_name",
    required: true,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.full_name,
    aliases: SHARED_IDENTITY_ALIASES.full_name,
  },
  {
    name: "email",
    required: false,
    kind: "email",
    maxLength: CSV_FIELD_LIMITS.email,
    aliases: SHARED_IDENTITY_ALIASES.email,
  },
  {
    name: "phone",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.phone,
    aliases: SHARED_IDENTITY_ALIASES.phone,
  },
  {
    name: "headline",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.headline,
    aliases: ["tagline", "summary", "bio"],
  },
  {
    name: "current_role",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.current_role,
    aliases: ["role", "title", "current role", "job title", "position", "job"],
  },
  {
    name: "experience_years",
    required: false,
    kind: "number",
    aliases: ["experience", "years", "years of experience", "exp", "yoe"],
  },
  {
    name: "skills",
    required: false,
    kind: "string_list",
    maxLength: CSV_FIELD_LIMITS.notes,
    aliases: ["skill", "skillset", "tags"],
  },
  {
    name: "location",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.location,
    aliases: SHARED_IDENTITY_ALIASES.location,
  },
  {
    name: "source",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.source,
    aliases: ["origin"],
  },
  {
    name: "source_url",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.source_url,
    aliases: ["url", "source url", "link", "profile url", "sourceurl"],
  },
  {
    name: "consent_status",
    required: false,
    kind: "enum",
    aliases: ["consent", "consent status"],
    enumValues: CONSENT_STATUSES,
    defaultWhenBlank: "owner_imported",
  },
  {
    name: "notes",
    required: false,
    kind: "text",
    maxLength: CSV_FIELD_LIMITS.notes,
    aliases: SHARED_IDENTITY_ALIASES.notes,
  },
];

export type CsvProfile = {
  name: CsvProfileName;
  fields: readonly CsvFieldSpec[];
  identityField: "email";
};

export const CSV_PROFILES: Record<CsvProfileName, CsvProfile> = {
  employee: {
    name: "employee",
    fields: EMPLOYEE_CSV_FIELDS,
    identityField: "email",
  },
  candidate: {
    name: "candidate",
    fields: CANDIDATE_CSV_FIELDS,
    identityField: "email",
  },
};

export function getCsvProfile(name: CsvProfileName): CsvProfile {
  return CSV_PROFILES[name];
}

/** Strip punctuation/whitespace so "E-mail" and "email_address" share a key. */
export function normalizeHeaderKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function fieldLookupKeys(spec: CsvFieldSpec): Set<string> {
  const keys = new Set<string>();
  keys.add(normalizeHeaderKey(spec.name));
  for (const alias of spec.aliases) {
    const key = normalizeHeaderKey(alias);
    if (key) keys.add(key);
  }
  return keys;
}
