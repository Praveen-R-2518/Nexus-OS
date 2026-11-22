"use client";

import { useRef, useState, type FormEvent } from "react";
import { EMPLOYMENT_STATUSES, type Employee, type EmploymentStatus } from "@/types";
import { ConfirmDialog } from "@/components/people/ConfirmDialog";
import {
  PEOPLE_CONTROL_CLASS,
  PEOPLE_TEXTAREA_CLASS,
  PeopleField,
} from "@/components/people/PeopleField";
import {
  EMPLOYMENT_STATUS_LABELS,
  isSensitiveEmploymentStatus,
} from "@/components/people/status-labels";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import type { EmployeeWriteBody } from "@/lib/queries/fetchers";

const FIELD_LIMITS = {
  full_name: 250,
  email: 320,
  phone: 80,
  role_title: 250,
  location: 250,
  notes: 10_000,
} as const;

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function needsSensitiveConfirm(
  next: EmploymentStatus,
  previous: EmploymentStatus | null,
): boolean {
  if (!isSensitiveEmploymentStatus(next)) return false;
  return previous !== next;
}

type EmployeeFormProps = {
  employee?: Employee;
  submitting: boolean;
  error: string | null;
  onSubmit: (body: EmployeeWriteBody) => Promise<void>;
};

export function EmployeeForm({
  employee,
  submitting,
  error,
  onSubmit,
}: EmployeeFormProps) {
  const [fullName, setFullName] = useState(employee?.full_name ?? "");
  const [email, setEmail] = useState(employee?.email ?? "");
  const [phone, setPhone] = useState(employee?.phone ?? "");
  const [roleTitle, setRoleTitle] = useState(employee?.role_title ?? "");
  const [status, setStatus] = useState<EmploymentStatus>(
    employee?.employment_status ?? "active",
  );
  const [startedOn, setStartedOn] = useState(employee?.started_on ?? "");
  const [endedOn, setEndedOn] = useState(employee?.ended_on ?? "");
  const [location, setLocation] = useState(employee?.location ?? "");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);

  const previousStatus = employee?.employment_status ?? null;
  const displayError = localError ?? error;
  const savingRef = useRef(false);

  function buildBody(): EmployeeWriteBody | null {
    const name = fullName.trim();
    if (!name) {
      setLocalError("Full name is required");
      return null;
    }
    setLocalError(null);
    return {
      full_name: name.slice(0, FIELD_LIMITS.full_name),
      email: emptyToNull(email),
      phone: emptyToNull(phone),
      role_title: emptyToNull(roleTitle),
      employment_status: status,
      started_on: emptyToNull(startedOn),
      ended_on: emptyToNull(endedOn),
      location: emptyToNull(location),
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
    const body = buildBody();
    if (!body) return;
    if (needsSensitiveConfirm(status, previousStatus)) {
      setStatusConfirmOpen(true);
      return;
    }
    void save();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <PeopleField id="employee-full-name" label="Full name" className="sm:col-span-2">
            <input
              id="employee-full-name"
              type="text"
              required
              maxLength={FIELD_LIMITS.full_name}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="employee-email" label="Email">
            <input
              id="employee-email"
              type="email"
              maxLength={FIELD_LIMITS.email}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="employee-phone" label="Phone">
            <input
              id="employee-phone"
              type="tel"
              maxLength={FIELD_LIMITS.phone}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="employee-role" label="Role">
            <input
              id="employee-role"
              type="text"
              maxLength={FIELD_LIMITS.role_title}
              value={roleTitle}
              onChange={(event) => setRoleTitle(event.target.value)}
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="employee-status" label="Employment status">
            <select
              id="employee-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as EmploymentStatus)
              }
              className={`${PEOPLE_CONTROL_CLASS} cursor-pointer`}
            >
              {EMPLOYMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {EMPLOYMENT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </PeopleField>
          <PeopleField id="employee-started-on" label="Started on">
            <input
              id="employee-started-on"
              type="date"
              value={startedOn}
              onChange={(event) => setStartedOn(event.target.value)}
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="employee-ended-on" label="Ended on">
            <input
              id="employee-ended-on"
              type="date"
              value={endedOn}
              onChange={(event) => setEndedOn(event.target.value)}
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="employee-location" label="Location" className="sm:col-span-2">
            <input
              id="employee-location"
              type="text"
              maxLength={FIELD_LIMITS.location}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={PEOPLE_CONTROL_CLASS}
            />
          </PeopleField>
          <PeopleField id="employee-notes" label="Notes" className="sm:col-span-2">
            <textarea
              id="employee-notes"
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
            {employee ? "Save changes" : "Create employee"}
          </Button>
        </div>
      </form>

      {statusConfirmOpen ? (
        <ConfirmDialog
          title={`Set status to ${EMPLOYMENT_STATUS_LABELS[status].toLowerCase()}?`}
          description={
            <p>
              This updates employment status on the roster. It does not send
              email or change archive state.
            </p>
          }
          confirmLabel="Confirm status"
          busy={submitting}
          onCancel={() => setStatusConfirmOpen(false)}
          onConfirm={() => {
            setStatusConfirmOpen(false);
            void save();
          }}
        />
      ) : null}
    </>
  );
}
