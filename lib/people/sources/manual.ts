import type { CandidateSource, NormalizedCandidate } from "@/lib/people/sources/types";
import {
  SOURCE_FIELD_LIMITS,
  boundedString,
  isRecord,
  parseConsent,
  parseExperienceYears,
  parseOptionalEmail,
  parseOptionalText,
  parseSkillList,
  sourceFail,
  sourceOk,
} from "@/lib/people/sources/fields";
import { parseSourceMetadata } from "@/lib/people/sources/metadata";

function originalSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return boundedString(raw, SOURCE_FIELD_LIMITS.source);
}

export const manualSource: CandidateSource = {
  id: "manual",
  label: "Manual entry",
  defaultConsent: "owner_imported",
  normalize(raw: unknown) {
    if (!isRecord(raw)) return sourceFail("Manual source expects an object");

    const fullName = boundedString(raw.full_name, SOURCE_FIELD_LIMITS.full_name);
    if (!fullName) return sourceFail("full_name is required");

    const email = parseOptionalEmail(raw.email);
    if (!email.ok) return email;
    const phone = parseOptionalText(raw.phone, "phone", "phone");
    if (!phone.ok) return phone;
    const headline = parseOptionalText(raw.headline, "headline", "headline");
    if (!headline.ok) return headline;
    const currentRole = parseOptionalText(
      raw.current_role,
      "current_role",
      "current_role",
    );
    if (!currentRole.ok) return currentRole;
    const location = parseOptionalText(raw.location, "location", "location");
    if (!location.ok) return location;
    const sourceUrl = parseOptionalText(raw.source_url, "source_url", "source_url");
    if (!sourceUrl.ok) return sourceUrl;
    const notes = parseOptionalText(raw.notes, "notes", "notes");
    if (!notes.ok) return notes;
    const years = parseExperienceYears(raw.experience_years);
    if (!years.ok) return years;
    const skills = parseSkillList(raw.skills);
    if (!skills.ok) return skills;
    const consent = parseConsent(raw.consent_status, "owner_imported");
    if (!consent.ok) return consent;

    const typedSource = originalSource(raw.source);
    const metadata: Record<string, unknown> = { adapter: "manual" };
    if (typedSource && typedSource !== "manual") {
      metadata.original_source = typedSource;
    }

    const parsedMeta = parseSourceMetadata(metadata);
    if (!parsedMeta.ok) return parsedMeta;

    const record: NormalizedCandidate = {
      full_name: fullName,
      email: email.data,
      phone: phone.data,
      headline: headline.data,
      current_role: currentRole.data,
      experience_years: years.data,
      skills: skills.data,
      location: location.data,
      source: "manual",
      source_url: sourceUrl.data,
      source_metadata: parsedMeta.data,
      consent_status: consent.data,
      notes: notes.data,
      external_id: null,
    };
    return sourceOk(record);
  },
};
