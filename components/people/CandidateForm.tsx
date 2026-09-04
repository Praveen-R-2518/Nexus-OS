"use client";

import { useRef, useState, type FormEvent } from "react";
import { CONSENT_STATUS_LABELS } from "@/components/people/consent-labels";
import {
  PEOPLE_CONTROL_CLASS,
  PEOPLE_TEXTAREA_CLASS,
  PeopleField,
} from "@/components/people/PeopleField";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { CandidateWriteBody } from "@/lib/queries/fetchers";
import {
  CONSENT_STATUSES,
  type Candidate,
  type ConsentStatus,
} from "@/types";

const FIELD_LIMITS = {
  full_name: 250,
  email: 320,
  phone: 80,
  headline: 250,
  current_role: 250,
  location: 250,
  source: 120,
  source_url: 2000,
  notes: 10_000,
} as const;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function skillsToText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((item): item is string => typeof item === "string")
    .join("\n");
}

function textToSkills(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function yearsToInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function parseYearsInput(
  raw: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Years of experience must be a number" };
  }
  if (n < 0) {
    return { ok: false, error: "Years of experience must be 0 or greater" };
  }
  if (n > 50) {
    return { ok: false, error: "Years of experience must not exceed 50" };
  }
  return { ok: true, value: n };
}

type CandidateFormProps = {
  candidate?: Candidate;
  submitting: boolean;
  error: string | null;
  onSubmit: (body: CandidateWriteBody) => Promise<void>;
};

export function CandidateForm({
  candidate,
  submitting,
  error,
  onSubmit,
}: CandidateFormProps) {
  const [fullName, setFullName] = useState(candidate?.full_name ?? "");
  const [email, setEmail] = useState(candidate?.email ?? "");
  const [phone, setPhone] = useState(candidate?.phone ?? "");
  const [headline, setHeadline] = useState(candidate?.headline ?? "");
  const [currentRole, setCurrentRole] = useState(candidate?.current_role ?? "");
  const [experienceYears, setExperienceYears] = useState(
    yearsToInput(candidate?.experience_years),
  );
  const [skills, setSkills] = useState(skillsToText(candidate?.skills));
  const [location, setLocation] = useState(candidate?.location ?? "");
  const [source, setSource] = useState(candidate?.source ?? "");
  const [sourceUrl, setSourceUrl] = useState(candidate?.source_url ?? "");
  const [consent, setConsent] = useState<ConsentStatus>(
    candidate?.consent_status ?? "owner_imported",
  );
  const [notes, setNotes] = useState(candidate?.notes ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = localError ?? error;
  const savingRef = useRef(false);

  function buildBody(): CandidateWriteBody | null {
    const name = fullName.trim();
    if (!name) {
      setLocalError("Full name is required");
      return null;
    }
    const years = parseYearsInput(experienceYears);
    if (!years.ok) {
      setLocalError(years.error);
      return null;
    }
    setLocalError(null);
    return {
      full_name: name.slice(0, FIELD_LIMITS.full_name),
      email: emptyToNull(email),
      phone: emptyToNull(phone),
      headline: emptyToNull(headline),
      current_role: emptyToNull(currentRole),
      experience_years: years.value,
      skills: textToSkills(skills),
      location: emptyToNull(location),
      source: emptyToNull(source),
      source_url: emptyToNull(sourceUrl),
      consent_status: consent,
      notes: emptyToNull(notes),
    };
  }

  async function save() {
    if (savingRef.current) return;
    const body = buildBody();
    if (!body) return;
    savingRef.current = true;
    try {
      await onSubmit(body);
    } finally {
      savingRef.current = false;
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <PeopleField id="candidate-full-name" label="Full name" className="sm:col-span-2">
          <input
            id="candidate-full-name"
            type="text"
            required
            maxLength={FIELD_LIMITS.full_name}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-email" label="Email">
          <input
            id="candidate-email"
            type="email"
            maxLength={FIELD_LIMITS.email}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-phone" label="Phone">
          <input
            id="candidate-phone"
            type="tel"
            maxLength={FIELD_LIMITS.phone}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-headline" label="Headline">
          <input
            id="candidate-headline"
            type="text"
            maxLength={FIELD_LIMITS.headline}
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-current-role" label="Current role">
          <input
            id="candidate-current-role"
            type="text"
            maxLength={FIELD_LIMITS.current_role}
            value={currentRole}
            onChange={(event) => setCurrentRole(event.target.value)}
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-years" label="Years of experience">
          <input
            id="candidate-years"
            type="number"
            min={0}
            max={50}
            step="0.5"
            value={experienceYears}
            onChange={(event) => setExperienceYears(event.target.value)}
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-consent" label="Consent">
          <select
            id="candidate-consent"
            value={consent}
            onChange={(event) =>
              setConsent(event.target.value as ConsentStatus)
            }
            className={`${PEOPLE_CONTROL_CLASS} cursor-pointer`}
          >
            {CONSENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CONSENT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </PeopleField>
        <PeopleField id="candidate-location" label="Location" className="sm:col-span-2">
          <input
            id="candidate-location"
            type="text"
            maxLength={FIELD_LIMITS.location}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField
          id="candidate-skills"
          label="Skills"
          hint="One skill per line, or comma-separated."
          className="sm:col-span-2"
        >
          <textarea
            id="candidate-skills"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            className={PEOPLE_TEXTAREA_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-source" label="Source">
          <input
            id="candidate-source"
            type="text"
            maxLength={FIELD_LIMITS.source}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-source-url" label="Source URL">
          <input
            id="candidate-source-url"
            type="text"
            maxLength={FIELD_LIMITS.source_url}
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            className={PEOPLE_CONTROL_CLASS}
          />
        </PeopleField>
        <PeopleField id="candidate-notes" label="Notes" className="sm:col-span-2">
          <textarea
            id="candidate-notes"
            maxLength={FIELD_LIMITS.notes}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={PEOPLE_TEXTAREA_CLASS}
          />
        </PeopleField>
      </div>

      {displayError ? (
        <p
          role="alert"
          className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
        >
          {displayError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <Spinner className="h-4 w-4" label="Saving" />
          ) : null}
          {candidate ? "Save changes" : "Create candidate"}
        </Button>
      </div>
    </form>
  );
}
