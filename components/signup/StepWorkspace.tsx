"use client";

import { useMemo, useState } from "react";
import { Building2, Plus, Trash2, User, Users } from "lucide-react";
import FormInput, { FormSelect } from "@/components/signup/FormInput";
import { authPrimaryButton } from "@/components/signup/authStyles";
import type { SignupSnapshot, WorkspaceType } from "@/components/signup/types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "E-commerce",
  "Consulting",
  "Real Estate",
  "Education",
  "Other",
] as const;

const COMPANY_SIZES = [
  "Just me",
  "2–10",
  "11–50",
  "51–200",
  "201–500",
  "500+",
] as const;

type StepWorkspaceProps = {
  snapshot: SignupSnapshot;
  onComplete: (patch: Partial<SignupSnapshot> & { workspaceId: string }) => void;
};

type LaunchWorkspaceResponse = {
  workspace_id?: unknown;
};

function parseWorkspaceId(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const raw = (data as LaunchWorkspaceResponse).workspace_id;
    return typeof raw === "string" && raw.trim() ? raw : undefined;
  }
  return undefined;
}

export default function StepWorkspace({ snapshot, onComplete }: StepWorkspaceProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [companyName, setCompanyName] = useState(snapshot.companyName || "");
  const [industry, setIndustry] = useState(snapshot.industry || INDUSTRIES[0]);
  const [companySize, setCompanySize] = useState(
    snapshot.companySize || COMPANY_SIZES[0],
  );
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>(
    snapshot.workspaceType || "solo",
  );
  const [teamSize, setTeamSize] = useState(
    snapshot.teamSize >= 2 ? snapshot.teamSize : 2,
  );
  const [teamEmails, setTeamEmails] = useState<string[]>(
    snapshot.teamEmails?.length ? snapshot.teamEmails : [""],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function addEmailRow() {
    setTeamEmails((rows) => [...rows, ""]);
  }
  function removeEmailRow(index: number) {
    setTeamEmails((rows) => rows.filter((_, i) => i !== index));
  }
  function updateEmailRow(index: number, value: string) {
    setTeamEmails((rows) => rows.map((v, i) => (i === index ? value : v)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (workspaceType === "team" && teamSize < 2) {
      setError("Expected users must be at least 2 for a team workspace.");
      return;
    }
    setBusy(true);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user?.id) {
      setError("You must be signed in to create a workspace.");
      setBusy(false);
      return;
    }

    const inviteEmails = teamEmails.map((s) => s.trim().toLowerCase()).filter(Boolean);

    const { data: rpcData, error: rpcError } = await supabase.rpc("launch_workspace", {
      company_name: companyName.trim(),
      invite_emails: inviteEmails,
      workspace_type: workspaceType,
      industry,
      company_size: companySize,
    });

    if (rpcError) {
      setError(rpcError.message || "Could not create workspace.");
      setBusy(false);
      return;
    }

    const wid = parseWorkspaceId(rpcData);

    if (!wid) {
      setError("Could not create workspace.");
      setBusy(false);
      return;
    }

    setBusy(false);
    onComplete({
      workspaceId: wid,
      companyName: companyName.trim(),
      industry,
      companySize,
      workspaceType,
      teamSize: workspaceType === "team" ? teamSize : 2,
      teamEmails: inviteEmails,
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="nexus-section-title text-foreground">Workspace setup</h2>
        <p className="mt-1 text-base text-gray-500 dark:text-gray-400">
          Tell us about your company. You can invite teammates later.
        </p>
      </div>
      <FormInput
        id="company"
        label="Company name"
        icon={Building2}
        value={companyName}
        onChange={(e) => setCompanyName(e.target.value)}
        required
        showValid
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormSelect
          id="industry"
          label="Industry"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          required
        >
          {INDUSTRIES.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          id="companySize"
          label="Company size"
          value={companySize}
          onChange={(e) => setCompanySize(e.target.value)}
          required
        >
          {COMPANY_SIZES.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </FormSelect>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Workspace type
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setWorkspaceType("solo")}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border border-selectable-edge bg-white p-4 text-left transition dark:bg-surface-card",
              workspaceType === "solo"
                ? "border border-nexus-intake-border bg-nexus-intake-soft dark:bg-nexus-intake-soft"
                : "hover:bg-nexus-intake-soft dark:hover:bg-surface-elevated",
            )}
          >
            <span className="flex items-center justify-center w-6 h-6" aria-hidden>
              <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </span>
            <span>
              <span className="flex items-center gap-2 font-sans font-semibold text-foreground">
                <User className="h-4 w-4 text-nexus-intake dark:text-nexus-intake" />
                Solo
              </span>
              <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
                Just me managing my inbox
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceType("team")}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-xl border border-selectable-edge bg-white p-4 text-left transition dark:bg-surface-card",
              workspaceType === "team"
                ? "border border-nexus-discovery-border bg-nexus-discovery-soft dark:bg-nexus-discovery-soft"
                : "hover:bg-nexus-discovery-soft dark:hover:bg-surface-elevated",
            )}
          >
            <span className="flex items-center justify-center w-6 h-6" aria-hidden>
              <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </span>
            <span>
              <span className="flex items-center gap-2 font-sans font-semibold text-foreground">
                <Users className="h-4 w-4 text-nexus-discovery dark:text-nexus-discovery" />
                Team
              </span>
              <span className="mt-1 block text-sm text-gray-500 dark:text-gray-400">
                Multiple people will use this workspace
              </span>
            </span>
          </button>
        </div>
      </div>
      {workspaceType === "team" ? (
        <div className="space-y-4 rounded-xl border border-nexus-discovery-border bg-nexus-discovery-soft p-4 dark:border-nexus-discovery-border dark:bg-nexus-discovery-soft">
          <FormInput
            id="teamSize"
            label="Expected number of users"
            type="number"
            min={2}
            value={String(teamSize)}
            onChange={(e) => setTeamSize(Math.max(2, Number(e.target.value) || 2))}
            required
          />
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Team member emails{" "}
                <span className="font-normal normal-case text-atmospheric-grey/40">(optional)</span>
              </p>
              <button
                type="button"
                onClick={addEmailRow}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-nexus-discovery-soft dark:border-border dark:bg-surface-card dark:text-gray-200 dark:hover:bg-surface-elevated"
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
            <div className="space-y-2">
              {teamEmails.map((row, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="email"
                    className="glass-input h-10 flex-1 px-3 text-sm text-atmospheric-grey outline-none placeholder:text-muted"
                    placeholder="teammate@company.com"
                    value={row}
                    onChange={(e) => updateEmailRow(i, e.target.value)}
                  />
                  {teamEmails.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remove row"
                      onClick={() => removeEmailRow(i)}
                      className="cursor-pointer border border-border p-2 text-gray-500 transition hover:bg-[rgba(18,116,249,0.06)] dark:border-border dark:text-gray-400 dark:hover:bg-surface-elevated"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-status-critical" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={authPrimaryButton}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
