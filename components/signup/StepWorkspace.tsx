"use client";

import { useMemo, useState } from "react";
import { Building2, Plus, Trash2, User, Users } from "lucide-react";
import FormInput, { FormSelect } from "@/components/signup/FormInput";
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

    const baseSlug = companyName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    const slug = `${baseSlug || "workspace"}-${Date.now()}`;

    const { data, error: wsError } = await supabase
      .from("workspaces")
      .insert({
        name: companyName.trim(),
        slug,
        workspace_type: workspaceType,
        industry,
        company_size: companySize,
        owner_user_id: user.id,
      })
      .select("id")
      .single();

    if (wsError || !data?.id) {
      setError(wsError?.message || "Could not create workspace.");
      setBusy(false);
      return;
    }

    const { error: memError } = await supabase.from("workspace_members").insert({
      workspace_id: data.id,
      user_id: user.id,
      role: "owner",
    });

    if (memError) {
      setError(memError.message);
      setBusy(false);
      return;
    }

    setBusy(false);
    onComplete({
      workspaceId: data.id,
      companyName: companyName.trim(),
      industry,
      companySize,
      workspaceType,
      teamSize: workspaceType === "team" ? teamSize : 2,
      teamEmails: teamEmails.map((s) => s.trim()).filter(Boolean),
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Workspace setup</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Workspace type</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setWorkspaceType("solo")}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition glass-panel",
              workspaceType === "solo"
                ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                : "border-gray-200 dark:border-gray-800 bg-surface-card dark:bg-gray-950 hover:border-gray-300 dark:border-gray-700",
            )}
          >
            <span className="flex items-center justify-center w-6 h-6" aria-hidden>
              <User className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </span>
            <span>
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <User className="h-4 w-4 text-[#1B6B3A]" />
                Solo
              </span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Just me managing my inbox
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceType("team")}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-4 text-left transition glass-panel",
              workspaceType === "team"
                ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30"
                : "border-gray-200 dark:border-gray-800 bg-surface-card dark:bg-gray-950 hover:border-gray-300 dark:border-gray-700",
            )}
          >
            <span className="flex items-center justify-center w-6 h-6" aria-hidden>
              <Users className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </span>
            <span>
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <Users className="h-4 w-4 text-[#1B6B3A]" />
                Team
              </span>
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Multiple people will use this workspace
              </span>
            </span>
          </button>
        </div>
      </div>
      {workspaceType === "team" ? (
        <div className="space-y-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-surface-card dark:bg-gray-950/60 p-4">
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
                <span className="font-normal text-atmospheric-grey/40">(optional)</span>
              </p>
              <button
                type="button"
                onClick={addEmailRow}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:bg-gray-800"
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
                    className="h-10 flex-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-3 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-emerald-500"
                    placeholder="teammate@company.com"
                    value={row}
                    onChange={(e) => updateEmailRow(i, e.target.value)}
                  />
                  {teamEmails.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Remove row"
                      onClick={() => removeEmailRow(i)}
                      className="rounded-lg border border-gray-300 dark:border-gray-700 p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:bg-gray-800"
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
        <p className="text-sm text-[#8B1A1A]" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex w-full items-center justify-center rounded-lg bg-trajectory-blue py-2.5 text-sm font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
