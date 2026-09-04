import {
  CONSENT_STATUSES,
  type ConsentStatus,
} from "@/types";
import type { SourceErr, SourceOk } from "@/lib/people/sources/types";

/** Match `lib/people/candidates.ts` write limits. */
export const SOURCE_FIELD_LIMITS = {
  full_name: 250,
  email: 320,
  phone: 80,
  headline: 250,
  current_role: 250,
  location: 250,
  source: 120,
  source_url: 2000,
  notes: 10_000,
  skill: 80,
  skills: 50,
  years: 50,
} as const;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sourceFail(error: string): SourceErr {
  return { ok: false, error };
}

export function sourceOk<T>(data: T): SourceOk<T> {
  return { ok: true, data };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function isConsentStatus(value: unknown): value is ConsentStatus {
  return (
    typeof value === "string" &&
    CONSENT_STATUSES.includes(value as ConsentStatus)
  );
}

export function parseOptionalEmail(
  raw: unknown,
): SourceOk<string | null> | SourceErr {
  if (raw === undefined || raw === null) return sourceOk(null);
  if (typeof raw !== "string") {
    return sourceFail("email must be a string or null");
  }
  const trimmed = raw.trim().slice(0, SOURCE_FIELD_LIMITS.email);
  if (!trimmed) return sourceOk(null);
  if (!EMAIL_RE.test(trimmed)) return sourceFail("email is invalid");
  return sourceOk(trimmed);
}

export function parseOptionalText(
  raw: unknown,
  key: keyof typeof SOURCE_FIELD_LIMITS,
  label: string,
): SourceOk<string | null> | SourceErr {
  if (raw === undefined || raw === null) return sourceOk(null);
  if (typeof raw !== "string") {
    return sourceFail(`${label} must be a string or null`);
  }
  return sourceOk(boundedString(raw, SOURCE_FIELD_LIMITS[key]));
}

export function parseExperienceYears(
  raw: unknown,
): SourceOk<number | null> | SourceErr {
  if (raw === undefined || raw === null || raw === "") return sourceOk(null);
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) {
    return sourceFail("experience_years must be a number or null");
  }
  if (n < 0) {
    return sourceFail("experience_years must be greater than or equal to 0");
  }
  if (n > SOURCE_FIELD_LIMITS.years) {
    return sourceFail(
      `experience_years must not exceed ${SOURCE_FIELD_LIMITS.years}`,
    );
  }
  return sourceOk(n);
}

export function parseSkillList(raw: unknown): SourceOk<string[]> | SourceErr {
  if (raw === undefined || raw === null) return sourceOk([]);
  if (!Array.isArray(raw)) return sourceFail("skills must be an array of strings");
  if (raw.length > SOURCE_FIELD_LIMITS.skills) {
    return sourceFail(`skills must not exceed ${SOURCE_FIELD_LIMITS.skills} items`);
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return sourceFail("skills must be an array of strings");
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > SOURCE_FIELD_LIMITS.skill) {
      return sourceFail(
        `skills entries must be at most ${SOURCE_FIELD_LIMITS.skill} characters`,
      );
    }
    out.push(trimmed);
  }
  return sourceOk(out);
}

export function parseConsent(
  raw: unknown,
  fallback: ConsentStatus,
): SourceOk<ConsentStatus> | SourceErr {
  if (raw === undefined || raw === null || raw === "") {
    return sourceOk(fallback);
  }
  if (!isConsentStatus(raw)) {
    return sourceFail(`consent_status must be one of: ${CONSENT_STATUSES.join(", ")}`);
  }
  return sourceOk(raw);
}
