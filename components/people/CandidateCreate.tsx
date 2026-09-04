"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CandidateForm } from "@/components/people/CandidateForm";
import { useTenantScope } from "@/components/tenant/TenantScope";
import {
  createCandidateMutation,
  type CandidateWriteBody,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";

export function CandidateCreate() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(body: CandidateWriteBody) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createCandidateMutation(body);
      queryClient.setQueryData(
        queryKeys.candidate(tenant.teamId, created.id),
        created,
      );
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.root(tenant.teamId), "candidates"],
      });
      router.push(`/people/candidates/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create candidate");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="hairline-b pb-6">
        <Link
          href="/people/candidates"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-nexus-intake transition-colors hover:text-atmospheric-grey"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to candidates
        </Link>
        <p className="mt-4 nexus-meta text-nexus-approval">People</p>
        <h1 className="mt-3 nexus-app-title text-balance text-atmospheric-grey">
          Add candidate
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Name is enough. Email, skills, and provenance are optional. This does
          not score or email anyone.
        </p>
      </header>

      <section className="app-glass-card rounded-xl p-5 sm:p-6">
        <CandidateForm
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
        />
      </section>
    </div>
  );
}
