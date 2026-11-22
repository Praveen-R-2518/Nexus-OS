"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ArrowLeft, UserRound } from "lucide-react";
import { ConfirmDialog } from "@/components/people/ConfirmDialog";
import { EmployeeForm } from "@/components/people/EmployeeForm";
import { EmployeeStatusPill } from "@/components/people/EmployeeStatusPill";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import {
  employeeQuery,
  updateEmployeeMutation,
  type EmployeeWriteBody,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";

export function EmployeeDetail({ employeeId }: { employeeId: string }) {
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null && Boolean(employeeId);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const {
    data: employee,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.employee(teamId, employeeId),
    queryFn: () => employeeQuery(employeeId),
    enabled: queriesEnabled,
    staleTime: 15_000,
  });

  const syncCaches = useCallback(
    async (next: typeof employee) => {
      if (!next) return;
      queryClient.setQueryData(queryKeys.employee(teamId, next.id), next);
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.root(teamId), "employees"],
      });
    },
    [queryClient, teamId],
  );

  async function handleSubmit(body: EmployeeWriteBody) {
    if (!employee) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const updated = await updateEmployeeMutation(employee.id, body);
      await syncCaches(updated);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save employee");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchArchived(archived: boolean) {
    if (!employee) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      const updated = await updateEmployeeMutation(employee.id, { archived });
      await syncCaches(updated);
      setArchiveOpen(false);
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Could not update archive state",
      );
    } finally {
      setArchiveBusy(false);
    }
  }

  if (tenant.loading || (queriesEnabled && isPending && !employee)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading employee" />
        <p className="text-sm">Loading employee…</p>
      </div>
    );
  }

  if (!queriesEnabled && tenant.ready) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Complete onboarding to manage employees for your team."
        icon={<UserRound />}
        className="min-h-[50vh]"
      />
    );
  }

  const errorMsg = error instanceof Error ? error.message : null;
  if (errorMsg && !employee) {
    return (
      <div className="space-y-4">
        <Link
          href="/people"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nexus-intake transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to employees
        </Link>
        <EmptyState
          title="Employee not found"
          description={errorMsg}
          icon={<UserRound />}
          className="min-h-[40vh]"
        />
      </div>
    );
  }

  if (!employee) return null;

  const archived = Boolean(employee.archived_at);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="hairline-b pb-6">
        <Link
          href="/people"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nexus-intake transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to employees
        </Link>
        <p className="mt-4 nexus-meta text-nexus-approval">People</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="nexus-app-title text-balance text-atmospheric-grey">
            {employee.full_name}
          </h1>
          <EmployeeStatusPill status={employee.employment_status} />
          {archived ? (
            <span className="inline-flex min-h-[1.5rem] items-center rounded-full border border-border-strong bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted">
              Archived
            </span>
          ) : null}
        </div>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Edit roster details. Archive hides the person from the default list
          without deleting the record.
        </p>
        {employee.email ? (
          <div className="mt-4">
            <Link
              href={`/people/email?type=employee&id=${encodeURIComponent(employee.id)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong bg-surface-muted px-5 py-2.5 text-sm font-medium text-atmospheric-grey transition-colors duration-interaction hover:bg-surface-elevated"
            >
              Compose email
            </Link>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">
            Add an email address to compose a letter from People.
          </p>
        )}
      </header>

      {archived ? (
        <div className="rounded-xl border border-border-strong bg-surface-muted px-4 py-3 text-sm text-muted">
          This employee is archived and hidden from the default roster.
        </div>
      ) : null}

      <section className="app-glass-card rounded-xl p-5 sm:p-6">
        <EmployeeForm
          key={employee.id + employee.updated_at}
          employee={employee}
          submitting={submitting}
          error={formError}
          onSubmit={handleSubmit}
        />
      </section>

      <section className="app-glass-card rounded-xl p-5 sm:p-6">
        <h2 className="nexus-section-title text-atmospheric-grey">Archive</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Archiving is a roster hide, not an employment-status change and not an
          email send.
        </p>
        {archiveError ? (
          <p
            role="alert"
            className="mt-3 border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
          >
            {archiveError}
          </p>
        ) : null}
        <div className="mt-4">
          {archived ? (
            <Button
              variant="secondary"
              disabled={archiveBusy}
              onClick={() => void patchArchived(false)}
            >
              {archiveBusy ? (
                <Spinner className="h-4 w-4" label="Restoring" />
              ) : null}
              Restore to roster
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={archiveBusy}
              onClick={() => setArchiveOpen(true)}
            >
              Archive employee
            </Button>
          )}
        </div>
      </section>

      {archiveOpen ? (
        <ConfirmDialog
          title="Archive this employee?"
          description={
            <p>
              {employee.full_name} will be hidden from the default roster. You
              can restore them later. This does not change employment status or
              send email.
            </p>
          }
          confirmLabel="Archive"
          variant="destructive"
          busy={archiveBusy}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => void patchArchived(true)}
        />
      ) : null}
    </div>
  );
}
