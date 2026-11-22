"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Mail } from "lucide-react";
import { ConfirmDialog } from "@/components/people/ConfirmDialog";
import {
  PEOPLE_EMAIL_PURPOSE_LABELS,
  PEOPLE_EMAIL_TONE_LABELS,
} from "@/components/people/email-labels";
import { PeopleEmailFollowUp } from "@/components/people/PeopleEmailFollowUp";
import {
  PEOPLE_CONTROL_CLASS,
  PEOPLE_TEXTAREA_CLASS,
  PeopleField,
} from "@/components/people/PeopleField";
import { useTenantScope } from "@/components/tenant/TenantScope";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import {
  MAX_BODY_LENGTH,
  MAX_SITUATION_LENGTH,
  MAX_SUBJECT_LENGTH,
} from "@/lib/ai/email-draft";
import {
  PEOPLE_EMAIL_PICKER_LIMIT,
  candidatesQuery,
  employeesQuery,
  generatePeopleEmailDraft,
  sendPeopleEmailDraft,
  settingsQuery,
  updatePeopleEmailDraft,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";
import {
  PEOPLE_EMAIL_PURPOSES,
  PEOPLE_EMAIL_TONES,
  type PeopleEmailPurpose,
  type PeopleEmailRecipientType,
  type PeopleEmailTone,
  type PeopleMessageDraft,
} from "@/types";

function isRecipientType(value: string | null): value is PeopleEmailRecipientType {
  return value === "employee" || value === "candidate";
}

function factsFromText(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function PeopleEmailComposer() {
  const searchParams = useSearchParams();
  const tenant = useTenantScope();
  const teamId = tenant.teamId;
  const queriesEnabled = tenant.ready && teamId !== null;

  const [recipientType, setRecipientType] =
    useState<PeopleEmailRecipientType>("employee");
  const [recipientId, setRecipientId] = useState("");
  const [purpose, setPurpose] = useState<PeopleEmailPurpose>("follow_up");
  const [tone, setTone] = useState<PeopleEmailTone>("professional");
  const [relatedDate, setRelatedDate] = useState("");
  const [situation, setSituation] = useState("");
  const [factsText, setFactsText] = useState("");
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);

  const [draft, setDraft] = useState<PeopleMessageDraft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const employees = useQuery({
    queryKey: queryKeys.employees(teamId, "", "", false, PEOPLE_EMAIL_PICKER_LIMIT, 0),
    queryFn: () => employeesQuery({ limit: PEOPLE_EMAIL_PICKER_LIMIT, offset: 0 }),
    enabled: queriesEnabled,
    staleTime: 15_000,
  });

  const candidates = useQuery({
    queryKey: queryKeys.candidates(
      teamId,
      "",
      "",
      false,
      PEOPLE_EMAIL_PICKER_LIMIT,
      0,
    ),
    queryFn: () =>
      candidatesQuery({ limit: PEOPLE_EMAIL_PICKER_LIMIT, offset: 0 }),
    enabled: queriesEnabled,
    staleTime: 15_000,
  });

  const settings = useQuery({
    queryKey: queryKeys.settings(teamId),
    queryFn: settingsQuery,
    enabled: queriesEnabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (deepLinkApplied) return;
    const type = searchParams.get("type");
    const id = searchParams.get("id")?.trim() ?? "";
    if (!isRecipientType(type) || !id) {
      setDeepLinkApplied(true);
      return;
    }
    setRecipientType(type);
    setRecipientId(id);
    setDeepLinkApplied(true);
  }, [deepLinkApplied, searchParams]);

  const pickerRows = useMemo(() => {
    if (recipientType === "employee") return employees.data?.data ?? [];
    return candidates.data?.data ?? [];
  }, [candidates.data?.data, employees.data?.data, recipientType]);

  const selected = pickerRows.find((row) => row.id === recipientId) ?? null;
  const selectedEmail = selected?.email?.trim() ?? "";
  const canGenerate = Boolean(selected && selectedEmail && situation.trim());
  const mailboxConnected = Boolean(settings.data?.channels.gmail.connected);
  const sent = draft?.status === "sent";
  const letterDirty =
    Boolean(draft) &&
    !sent &&
    (subject !== draft?.subject || body !== draft?.body);

  async function handleGenerate() {
    if (!canGenerate || !selected) return;
    setGenerateBusy(true);
    setGenerateError(null);
    setSendError(null);
    try {
      const next = await generatePeopleEmailDraft({
        recipient_type: recipientType,
        recipient_id: selected.id,
        purpose,
        tone,
        situation: situation.trim(),
        facts: factsFromText(factsText),
        related_date: relatedDate || null,
      });
      setDraft(next);
      setSubject(next.subject);
      setBody(next.body);
    } catch (err) {
      setGenerateError(
        err instanceof Error ? err.message : "Could not generate draft",
      );
    } finally {
      setGenerateBusy(false);
    }
  }

  async function persistLetterIfDirty(): Promise<PeopleMessageDraft | null> {
    if (!draft || sent) return draft;
    if (!letterDirty) return draft;
    const next = await updatePeopleEmailDraft(draft.id, { subject, body });
    setDraft(next);
    setSubject(next.subject);
    setBody(next.body);
    return next;
  }

  async function handleSend() {
    if (!draft || sent) return;
    setSendBusy(true);
    setSendError(null);
    try {
      const stored = await persistLetterIfDirty();
      if (!stored) return;
      const next = await sendPeopleEmailDraft(stored.id, {
        subject,
        body,
      });
      setDraft(next);
      setSubject(next.subject);
      setBody(next.body);
      setSendOpen(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setSendBusy(false);
    }
  }

  if (tenant.loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
        <Spinner className="h-8 w-8" label="Loading composer" />
        <p className="text-sm">Loading composer…</p>
      </div>
    );
  }

  if (!queriesEnabled && tenant.ready) {
    return (
      <EmptyState
        title="Workspace setup required"
        description="Complete onboarding to draft People emails for your team."
        icon={<Mail />}
        className="min-h-[50vh]"
      />
    );
  }

  const listsPending =
    (recipientType === "employee" && employees.isPending) ||
    (recipientType === "candidate" && candidates.isPending);
  const hasEmailable = pickerRows.some((row) => Boolean(row.email?.trim()));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="hairline-b pb-6">
        <p className="nexus-meta text-nexus-approval">People</p>
        <h1 className="mt-3 nexus-app-title text-balance text-atmospheric-grey">
          Email
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Pick a person from Employees or Candidates, generate a draft, edit it,
          then send. Nexus will not change their People record when the email
          goes out.
        </p>
      </header>

      {!mailboxConnected && settings.data ? (
        <div className="rounded-xl border border-border-strong bg-surface-muted px-4 py-3 text-sm text-muted">
          Connect Gmail or a mailbox in{" "}
          <Link
            href="/profile"
            className="font-medium text-nexus-intake hover:text-atmospheric-grey"
          >
            Settings
          </Link>{" "}
          before sending. You can still generate and edit a draft.
        </div>
      ) : null}

      <section className="app-glass-card space-y-5 rounded-xl p-5 sm:p-6">
        <h2 className="nexus-section-title text-atmospheric-grey">Recipient</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <PeopleField id="people-email-type" label="Type">
            <select
              id="people-email-type"
              className={PEOPLE_CONTROL_CLASS}
              value={recipientType}
              disabled={generateBusy || sendBusy || sent}
              onChange={(event) => {
                const next = event.target.value;
                if (!isRecipientType(next)) return;
                setRecipientType(next);
                setRecipientId("");
              }}
            >
              <option value="employee">Employee</option>
              <option value="candidate">Candidate</option>
            </select>
          </PeopleField>
          <PeopleField id="people-email-recipient" label="Person">
            <select
              id="people-email-recipient"
              className={PEOPLE_CONTROL_CLASS}
              value={recipientId}
              disabled={generateBusy || sendBusy || sent || listsPending}
              onChange={(event) => setRecipientId(event.target.value)}
            >
              <option value="">
                {listsPending ? "Loading…" : "Select a person"}
              </option>
              {pickerRows.map((row) => {
                const email = row.email?.trim() ?? "";
                return (
                  <option key={row.id} value={row.id} disabled={!email}>
                    {email
                      ? `${row.full_name} (${email})`
                      : `${row.full_name} (no email)`}
                  </option>
                );
              })}
            </select>
          </PeopleField>
          <PeopleField id="people-email-purpose" label="Purpose">
            <select
              id="people-email-purpose"
              className={PEOPLE_CONTROL_CLASS}
              value={purpose}
              disabled={generateBusy || sendBusy || sent}
              onChange={(event) =>
                setPurpose(event.target.value as PeopleEmailPurpose)
              }
            >
              {PEOPLE_EMAIL_PURPOSES.map((item) => (
                <option key={item} value={item}>
                  {PEOPLE_EMAIL_PURPOSE_LABELS[item]}
                </option>
              ))}
            </select>
          </PeopleField>
          <PeopleField id="people-email-tone" label="Tone">
            <select
              id="people-email-tone"
              className={PEOPLE_CONTROL_CLASS}
              value={tone}
              disabled={generateBusy || sendBusy || sent}
              onChange={(event) => setTone(event.target.value as PeopleEmailTone)}
            >
              {PEOPLE_EMAIL_TONES.map((item) => (
                <option key={item} value={item}>
                  {PEOPLE_EMAIL_TONE_LABELS[item]}
                </option>
              ))}
            </select>
          </PeopleField>
          <PeopleField
            id="people-email-date"
            label="Related date"
            hint="Optional context for the letter, not a scheduled send."
          >
            <input
              id="people-email-date"
              type="date"
              className={PEOPLE_CONTROL_CLASS}
              value={relatedDate}
              disabled={generateBusy || sendBusy || sent}
              onChange={(event) => setRelatedDate(event.target.value)}
            />
          </PeopleField>
        </div>
        <PeopleField id="people-email-situation" label="Situation">
          <textarea
            id="people-email-situation"
            className={PEOPLE_TEXTAREA_CLASS}
            maxLength={MAX_SITUATION_LENGTH}
            value={situation}
            disabled={generateBusy || sendBusy || sent}
            onChange={(event) => setSituation(event.target.value)}
            placeholder="What this email is about. Use only facts you want in the letter."
          />
        </PeopleField>
        <PeopleField
          id="people-email-facts"
          label="Extra facts"
          hint="One fact per line. Optional. Do not include instructions for the model."
        >
          <textarea
            id="people-email-facts"
            className={PEOPLE_TEXTAREA_CLASS}
            value={factsText}
            disabled={generateBusy || sendBusy || sent}
            onChange={(event) => setFactsText(event.target.value)}
          />
        </PeopleField>
        {generateError ? (
          <p
            role="alert"
            className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
          >
            {generateError}
          </p>
        ) : null}
        {!listsPending && !hasEmailable ? (
          <EmptyState
            title={
              recipientType === "employee"
                ? "No employees with email"
                : "No candidates with email"
            }
            description="Add an email on the roster before generating a letter. Nexus will not invent an address."
            icon={<Mail />}
          />
        ) : null}
        <Button
          onClick={() => void handleGenerate()}
          disabled={!canGenerate || generateBusy || sendBusy || sent}
        >
          {generateBusy ? (
            <Spinner className="h-4 w-4" label="Generating" />
          ) : null}
          Generate draft
        </Button>
      </section>

      {draft ? (
        <section className="app-glass-card space-y-5 rounded-xl p-5 sm:p-6">
          <h2 className="nexus-section-title text-atmospheric-grey">
            {sent ? "Sent letter" : "Draft"}
          </h2>
          <p className="text-sm text-muted">
            {sent
              ? `Sent to ${draft.recipient_name ?? "recipient"} at ${draft.recipient_email}. People records were not changed.`
              : `To ${draft.recipient_name ?? "recipient"} at ${draft.recipient_email}. Edit before sending.`}
          </p>
          <PeopleField id="people-email-subject" label="Subject">
            <input
              id="people-email-subject"
              className={PEOPLE_CONTROL_CLASS}
              maxLength={MAX_SUBJECT_LENGTH}
              value={subject}
              disabled={generateBusy || sendBusy || sent}
              onChange={(event) => setSubject(event.target.value)}
            />
          </PeopleField>
          <PeopleField id="people-email-body" label="Body">
            <textarea
              id="people-email-body"
              className={`${PEOPLE_TEXTAREA_CLASS} min-h-[16rem]`}
              maxLength={MAX_BODY_LENGTH}
              value={body}
              disabled={generateBusy || sendBusy || sent}
              onChange={(event) => setBody(event.target.value)}
            />
          </PeopleField>
          {sendError ? (
            <p
              role="alert"
              className="border border-status-critical-border bg-status-critical-surface px-3 py-2 font-mono text-xs text-status-critical"
            >
              {sendError}
            </p>
          ) : null}
          <Button
            onClick={() => {
              setSendError(null);
              setSendOpen(true);
            }}
            disabled={
              sent ||
              generateBusy ||
              sendBusy ||
              !mailboxConnected ||
              !subject.trim() ||
              !body.trim()
            }
          >
            Send
          </Button>
        </section>
      ) : null}

      {sent && draft ? <PeopleEmailFollowUp draft={draft} /> : null}

      {sendOpen && draft ? (
        <ConfirmDialog
          title="Send this email?"
          description={
            <p>
              This will email {draft.recipient_name ?? "the recipient"} at{" "}
              {draft.recipient_email}. Nexus will not change their People
              record.
            </p>
          }
          confirmLabel="Send email"
          busy={sendBusy}
          onCancel={() => {
            if (!sendBusy) setSendOpen(false);
          }}
          onConfirm={() => void handleSend()}
        />
      ) : null}
    </div>
  );
}
