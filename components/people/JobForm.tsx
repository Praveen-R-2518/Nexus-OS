"use client";

import { useRef, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/people/ConfirmDialog";
import {
  JOB_STATUS_LABELS,
  REMOTE_POLICY_LABELS,
  SCORING_WEIGHT_LABELS,
} from "@/components/people/job-labels";
import {
  PEOPLE_CONTROL_CLASS,
  PEOPLE_TEXTAREA_CLASS,
  PeopleField,
} from "@/components/people/PeopleField";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  DEFAULT_SCORING_WEIGHTS,
  parseStoredWeights,
  sumWeights,
  validateScoringWeights,
  WEIGHT_SUM_EPSILON,
} from "@/lib/people/scoring-weights";
import type { JobWriteBody } from "@/lib/queries/fetchers";
import {
  JOB_STATUSES,
  REMOTE_POLICIES,
  SCORING_WEIGHT_KEYS,
  type Job,
  type JobStatus,
  type RemotePolicy,
  type ScoringWeightKey,
  type ScoringWeights,
} from "@/types";

const FIELD_LIMITS = {
  title: 250,
  description: 10_000,
  seniority: 80,
  location: 250,
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
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function yearsToInput(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return String(value);
}

function parseYearsInput(
  raw: string,
  key: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return { ok: false, error: `${key} must be a number` };
  if (n < 0) return { ok: false, error: `${key} must be 0 or greater` };
  if (n > 50) return { ok: false, error: `${key} must not exceed 50` };
  return { ok: true, value: n };
}

function initialWeights(job?: Job): ScoringWeights {
  const stored = job ? parseStoredWeights(job.scoring_weights) : null;
  return stored ?? DEFAULT_SCORING_WEIGHTS;
}

type JobFormProps = {
  job?: Job;
  submitting: boolean;
  error: string | null;
  onSubmit: (body: JobWriteBody) => Promise<void>;
};

export function JobForm({ job, submitting, error, onSubmit }: JobFormProps) {
  const [title, setTitle] = useState(job?.title ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [status, setStatus] = useState<JobStatus>(job?.status ?? "draft");
  const [requiredSkills, setRequiredSkills] = useState(
    skillsToText(job?.required_skills),
  );
  const [preferredSkills, setPreferredSkills] = useState(
    skillsToText(job?.preferred_skills),
  );
  const [minYears, setMinYears] = useState(yearsToInput(job?.experience_min_years));
  const [maxYears, setMaxYears] = useState(yearsToInput(job?.experience_max_years));
  const [seniority, setSeniority] = useState(job?.seniority ?? "");
  const [location, setLocation] = useState(job?.location ?? "");
  const [remotePolicy, setRemotePolicy] = useState<RemotePolicy | "">(
    job?.remote_policy ?? "",
  );
  const [weights, setWeights] = useState<ScoringWeights>(initialWeights(job));
  const [localError, setLocalError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const previousStatus = job?.status ?? null;
  const displayError = localError ?? error;
  const savingRef = useRef(false);
  const weightSum = sumWeights(weights);
  const weightSumOk = Math.abs(weightSum - 1) <= WEIGHT_SUM_EPSILON;

  function setWeight(key: ScoringWeightKey, raw: string) {
    const n = Number(raw);
    setWeights((prev) => ({
      ...prev,
      [key]: Number.isFinite(n) ? n : 0,
    }));
  }

  function buildBody(): JobWriteBody | null {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setLocalError("Title is required");
      return null;
    }

    const min = parseYearsInput(minYears, "Minimum years");
    if (!min.ok) {
      setLocalError(min.error);
      return null;
    }
    const max = parseYearsInput(maxYears, "Maximum years");
    if (!max.ok) {
      setLocalError(max.error);
      return null;
    }
    if (min.value !== null && max.value !== null && min.value > max.value) {
      setLocalError("Minimum years must be less than or equal to maximum years");
      return null;
    }

    const parsedWeights = validateScoringWeights(weights);
    if (!parsedWeights.ok) {
      setLocalError(parsedWeights.error);
      return null;
    }

    setLocalError(null);
    return {
      title: nextTitle.slice(0, FIELD_LIMITS.title),
      description: emptyToNull(description),
      status,
      required_skills: textToSkills(requiredSkills),
      preferred_skills: textToSkills(preferredSkills),
      experience_min_years: min.value,
      experience_max_years: max.value,
      seniority: emptyToNull(seniority),
      location: emptyToNull(location),
      remote_policy: remotePolicy || null,
      scoring_weights: parsedWeights.weights,
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
    const body = buildBody();
    if (!body) return;
    if (status === "closed" && previousStatus !== "closed") {
      setCloseConfirmOpen(true);
      return;
    }
    void save();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <PeopleField id="job-title" label="Title" className="sm:col-span-2">
            <input
              id="job-title"
              type="text"
              required
              maxLength={FIELD_LIMITS.title}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="job-status" label="Status">
            <select
              id="job-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as JobStatus)}
              className={`${PEOPLE_CONTROL_CLASS} cursor-pointer`}
            >
              {JOB_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {JOB_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </PeopleField>
          <PeopleField id="job-remote" label="Remote policy">
            <select
              id="job-remote"
              value={remotePolicy}
              onChange={(event) =>
                setRemotePolicy(event.target.value as RemotePolicy | "")
              }
              className={`${PEOPLE_CONTROL_CLASS} cursor-pointer`}
            >
              <option value="">Not set</option>
              {REMOTE_POLICIES.map((value) => (
                <option key={value} value={value}>
                  {REMOTE_POLICY_LABELS[value]}
                </option>
              ))}
            </select>
          </PeopleField>
          <PeopleField id="job-location" label="Location" className="sm:col-span-2">
            <input
              id="job-location"
              type="text"
              maxLength={FIELD_LIMITS.location}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="job-seniority" label="Seniority">
            <input
              id="job-seniority"
              type="text"
              maxLength={FIELD_LIMITS.seniority}
              value={seniority}
              onChange={(event) => setSeniority(event.target.value)}
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <div className="grid grid-cols-2 gap-4">
            <PeopleField id="job-min-years" label="Min years">
              <input
                id="job-min-years"
                type="number"
                min={0}
                max={50}
                step="0.5"
                value={minYears}
                onChange={(event) => setMinYears(event.target.value)}
                className={PEOPLE_CONTROL_CLASS}
              />
            </PeopleField>
            <PeopleField id="job-max-years" label="Max years">
              <input
                id="job-max-years"
                type="number"
                min={0}
                max={50}
                step="0.5"
                value={maxYears}
                onChange={(event) => setMaxYears(event.target.value)}
                className={PEOPLE_CONTROL_CLASS}
              />
            </PeopleField>
          </div>
          <PeopleField
            id="job-required-skills"
            label="Required skills"
            hint="One skill per line."
            className="sm:col-span-2"
          >
            <textarea
              id="job-required-skills"
              value={requiredSkills}
              onChange={(event) => setRequiredSkills(event.target.value)}
              className={PEOPLE_TEXTAREA_CLASS}
            />
          </PeopleField>
          <PeopleField
            id="job-preferred-skills"
            label="Preferred skills"
            hint="One skill per line."
            className="sm:col-span-2"
          >
            <textarea
              id="job-preferred-skills"
              value={preferredSkills}
              onChange={(event) => setPreferredSkills(event.target.value)}
              className={PEOPLE_TEXTAREA_CLASS}
            />
          </PeopleField>
          <PeopleField
            id="job-description"
            label="Description"
            className="sm:col-span-2"
          >
            <textarea
              id="job-description"
              maxLength={FIELD_LIMITS.description}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={PEOPLE_TEXTAREA_CLASS}
            />
          </PeopleField>
        </div>

        <section className="space-y-3 rounded-xl border border-border/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium text-atmospheric-grey">
                Scoring weights
              </h2>
              {job ? (
                <p className="mt-1 text-xs text-muted">
                  Weights version {job.scoring_weights_version} — changing
                  weights keeps old candidate scores until a re-run.
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  Must sum to 1.0. Defaults are applied if you leave these
                  unchanged.
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setWeights(DEFAULT_SCORING_WEIGHTS)}
            >
              Reset to defaults
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SCORING_WEIGHT_KEYS.map((key) => (
              <PeopleField key={key} id={`job-weight-${key}`} label={SCORING_WEIGHT_LABELS[key]}>
                <input
                  id={`job-weight-${key}`}
                  type="number"
                  min={0}
                  max={1}
                  step="0.01"
                  value={weights[key]}
                  onChange={(event) => setWeight(key, event.target.value)}
                  className={PEOPLE_CONTROL_CLASS}
                />
              </PeopleField>
            ))}
          </div>
          <p
            className={
              weightSumOk
                ? "text-xs tabular-nums text-muted"
                : "text-xs tabular-nums text-status-critical"
            }
          >
            Sum {weightSum.toFixed(2)} / 1.00
          </p>
        </section>

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
            {job ? "Save changes" : "Create job"}
          </Button>
        </div>
      </form>

      {closeConfirmOpen ? (
        <ConfirmDialog
          title="Close this job?"
          description={
            <p>
              Closed jobs stay on the list unless you archive them. This does
              not rank or contact candidates.
            </p>
          }
          confirmLabel="Close job"
          busy={submitting}
          onCancel={() => setCloseConfirmOpen(false)}
          onConfirm={() => {
            setCloseConfirmOpen(false);
            void save();
          }}
        />
      ) : null}
    </>
  );
}
