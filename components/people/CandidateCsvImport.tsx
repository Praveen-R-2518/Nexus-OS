"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { PEOPLE_CONTROL_CLASS } from "@/components/people/PeopleField";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  CANDIDATE_CSV_FIELDS,
  CSV_DEFAULT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  formatCsvImportSummary,
  type CsvColumnMapping,
  type CsvImportPlan,
  type CsvRowAction,
} from "@/lib/csv";
import {
  importCandidateCsv,
  previewCandidateCsv,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  full_name: "Full name",
  email: "Email",
  phone: "Phone",
  headline: "Headline",
  current_role: "Current role",
  experience_years: "Experience (years)",
  skills: "Skills",
  location: "Location",
  source: "Source",
  source_url: "Source URL",
  consent_status: "Consent status",
  notes: "Notes",
};

const ACTION_STYLES: Record<CsvRowAction, string> = {
  imported:
    "border-status-positive-border bg-status-positive-surface text-status-positive",
  updated:
    "border-nexus-approval-border bg-nexus-approval-soft text-nexus-approval",
  duplicate: "border-border-strong bg-surface-muted text-muted",
  failed:
    "border-status-critical-border bg-status-critical-surface text-status-critical",
};

type JobOption = {
  id: string;
  title: string;
};

function mappingFromPlan(plan: CsvImportPlan): Record<string, string> {
  const next: Record<string, string> = {};
  for (const header of plan.headers) {
    next[header] = plan.mapping[header] ?? "";
  }
  return next;
}

function mappingPayload(local: Record<string, string>): CsvColumnMapping {
  const mapping: CsvColumnMapping = {};
  for (const [header, field] of Object.entries(local)) {
    if (field) mapping[header] = field;
  }
  return mapping;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(", ") || "—";
  return String(value);
}

export function CandidateCsvImport({
  open,
  onClose,
  jobId: lockedJobId,
  jobTitle,
  jobs = [],
}: {
  open: boolean;
  onClose: () => void;
  /** When set, import is scoped to this job and the picker is hidden. */
  jobId?: string;
  jobTitle?: string;
  /** Non-archived jobs for the list-page picker (ignored when jobId is set). */
  jobs?: JobOption[];
}) {
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;

  const [selectedJobId, setSelectedJobId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [localMapping, setLocalMapping] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<CsvImportPlan | null>(null);
  const [result, setResult] = useState<CsvImportPlan | null>(null);
  const [attachedCount, setAttachedCount] = useState<number | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveJobId = lockedJobId ?? selectedJobId;
  const jobLocked = Boolean(lockedJobId);
  const jobsAvailable = jobLocked || jobs.length > 0;

  useEffect(() => {
    if (!open) return;
    if (!lockedJobId && jobs.length === 1) {
      setSelectedJobId(jobs[0].id);
    }
  }, [open, lockedJobId, jobs]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, open]);

  const fullNameMapped = Object.values(localMapping).includes("full_name");
  const shown = result ?? plan;
  const rowErrors = shown?.errors ?? [];

  const summaryText = useMemo(() => {
    if (!shown) return null;
    const base = formatCsvImportSummary(shown.summary);
    if (attachedCount === null) return base;
    return `${base} · ${attachedCount} attached to job`;
  }, [shown, attachedCount]);

  if (!open) return null;

  function reset() {
    if (!lockedJobId) setSelectedJobId("");
    setCsvText("");
    setFileName("");
    setLocalMapping({});
    setPlan(null);
    setResult(null);
    setAttachedCount(null);
    setBusy(null);
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function runPreview(text: string, mapping?: CsvColumnMapping) {
    if (!effectiveJobId) {
      setError("Select a job before previewing");
      return;
    }
    setBusy("preview");
    setError(null);
    setResult(null);
    setAttachedCount(null);
    try {
      const next = await previewCandidateCsv({
        csv: text,
        job_id: effectiveJobId,
        mapping,
      });
      setPlan(next);
      setLocalMapping(mappingFromPlan(next));
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : "CSV preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!effectiveJobId) {
      setError("Select a job before uploading a CSV");
      return;
    }
    if (file.size > CSV_DEFAULT_MAX_BYTES) {
      setError("CSV exceeds the 1 MB size limit");
      return;
    }
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setPlan(null);
    setResult(null);
    setAttachedCount(null);
    await runPreview(text);
  }

  async function onRefreshPreview() {
    if (!csvText) return;
    await runPreview(csvText, mappingPayload(localMapping));
  }

  async function onImport() {
    if (!csvText || !fullNameMapped || !effectiveJobId) return;
    setBusy("import");
    setError(null);
    try {
      const next = await importCandidateCsv({
        csv: csvText,
        job_id: effectiveJobId,
        mapping: mappingPayload(localMapping),
      });
      setResult(next);
      setPlan(next);
      setAttachedCount(typeof next.attached === "number" ? next.attached : null);
      if (teamId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.root(teamId) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "CSV import failed");
    } finally {
      setBusy(null);
    }
  }

  const selectedJobLabel =
    jobTitle ??
    jobs.find((job) => job.id === effectiveJobId)?.title ??
    "Selected job";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="people-candidate-csv-import-title"
      onClick={() => {
        if (!busy) close();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-glass-border bg-glass shadow-2xl backdrop-blur-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2
              id="people-candidate-csv-import-title"
              className="text-base font-semibold text-atmospheric-grey"
            >
              Import candidates
            </h2>
            <p className="mt-1 text-sm text-muted">
              CSV up to 1 MB and {CSV_IMPORT_MAX_ROWS} rows. Candidates are
              attached to the selected job at stage New. Partial success is
              allowed.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={Boolean(busy)}
            aria-label="Close"
            className="text-muted transition-colors hover:text-atmospheric-grey disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {jobLocked ? (
            <div className="rounded-xl border border-border-strong bg-surface-muted px-3 py-2 text-sm text-atmospheric-grey">
              Job: <span className="font-medium">{selectedJobLabel}</span>
            </div>
          ) : (
            <div className="space-y-2">
              <label
                className="block text-sm font-medium text-atmospheric-grey"
                htmlFor="candidate-csv-job"
              >
                Job
              </label>
              {!jobsAvailable ? (
                <p className="text-sm text-muted">
                  Create a job first, then import candidates onto it.
                </p>
              ) : (
                <select
                  id="candidate-csv-job"
                  value={selectedJobId}
                  disabled={Boolean(busy) || Boolean(result)}
                  onChange={(event) => {
                    setSelectedJobId(event.target.value);
                    setPlan(null);
                    setResult(null);
                    setAttachedCount(null);
                    if (csvText && event.target.value) {
                      void runPreview(csvText, mappingPayload(localMapping));
                    }
                  }}
                  className={PEOPLE_CONTROL_CLASS}
                >
                  <option value="">Select a job…</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label
              className="block text-sm font-medium text-atmospheric-grey"
              htmlFor="candidate-csv-file"
            >
              CSV file
            </label>
            <input
              id="candidate-csv-file"
              type="file"
              accept=".csv,text/csv,text/plain"
              disabled={Boolean(busy) || !effectiveJobId}
              onChange={(event) => {
                void onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
              className="block max-w-full text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border-strong file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-atmospheric-grey hover:file:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
            />
            {fileName ? <p className="text-xs text-muted">{fileName}</p> : null}
          </div>

          {error ? (
            <p
              className="rounded-xl border border-status-critical-border bg-status-critical-surface px-3 py-2 text-sm text-status-critical"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {busy === "preview" && !shown ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="h-4 w-4" label="Previewing CSV" />
              Building preview…
            </div>
          ) : null}

          {plan ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-sm font-medium text-atmospheric-grey">
                  Column mapping
                </p>
                <Button
                  variant="secondary"
                  onClick={() => void onRefreshPreview()}
                  disabled={Boolean(busy) || !effectiveJobId}
                  className="px-3 py-2 text-xs"
                >
                  {busy === "preview" ? (
                    <Spinner className="h-4 w-4" label="Updating preview" />
                  ) : null}
                  Update preview
                </Button>
              </div>
              <div className="space-y-2">
                {plan.headers.map((header) => (
                  <div
                    key={header}
                    className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-center"
                  >
                    <p
                      className="truncate text-sm text-atmospheric-grey"
                      title={header}
                    >
                      {header}
                    </p>
                    <select
                      aria-label={`Map column ${header}`}
                      value={localMapping[header] ?? ""}
                      disabled={Boolean(busy) || Boolean(result)}
                      onChange={(event) => {
                        const value = event.target.value;
                        setLocalMapping((current) => ({
                          ...current,
                          [header]: value,
                        }));
                      }}
                      className={PEOPLE_CONTROL_CLASS}
                    >
                      <option value="">Ignore</option>
                      {CANDIDATE_CSV_FIELDS.map((spec) => (
                        <option key={spec.name} value={spec.name}>
                          {FIELD_LABELS[spec.name] ?? spec.name}
                          {spec.required ? " (required)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {!fullNameMapped ? (
                <p className="text-xs text-status-warning">
                  Map a column to Full name before importing.
                </p>
              ) : null}
            </div>
          ) : null}

          {shown && summaryText ? (
            <div className="space-y-3">
              <p className="font-mono text-sm text-atmospheric-grey">
                {summaryText}
              </p>
              <div className="app-glass-card max-h-56 overflow-auto rounded-xl">
                <table className="w-full min-w-[28rem] text-left text-sm">
                  <thead>
                    <tr className="text-muted">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.rows.map((row) => (
                      <tr key={row.row} className="hairline-t">
                        <td className="px-3 py-2 tabular-nums text-muted">
                          {row.row}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex min-h-[1.5rem] items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
                              ACTION_STYLES[row.action],
                            )}
                          >
                            {row.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-atmospheric-grey">
                          {displayValue(row.values.full_name)}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {displayValue(row.values.email)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rowErrors.length > 0 ? (
                <ul className="space-y-1 rounded-xl border border-status-critical-border bg-status-critical-surface px-3 py-2 text-xs text-status-critical">
                  {rowErrors.map((item, index) => (
                    <li key={`${item.row}-${item.field ?? ""}-${index}`}>
                      Row {item.row}
                      {item.field ? ` (${item.field})` : ""}: {item.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-6">
          <Button variant="secondary" onClick={close} disabled={Boolean(busy)}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result ? (
            <Button
              onClick={() => void onImport()}
              disabled={
                Boolean(busy) ||
                !csvText ||
                !fullNameMapped ||
                !effectiveJobId ||
                !jobsAvailable
              }
            >
              {busy === "import" ? (
                <Spinner className="h-4 w-4" label="Importing" />
              ) : null}
              Import
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
