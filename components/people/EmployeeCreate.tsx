"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { EmployeeForm } from "@/components/people/EmployeeForm";
import { useTenantScope } from "@/components/tenant/TenantScope";
import {
  createEmployeeMutation,
  type EmployeeWriteBody,
} from "@/lib/queries/fetchers";
import { queryKeys } from "@/lib/queries/keys";

export function EmployeeCreate() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenant = useTenantScope();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(body: EmployeeWriteBody) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await createEmployeeMutation(body);
      queryClient.setQueryData(
        queryKeys.employee(tenant.teamId, created.id),
        created,
      );
      await queryClient.invalidateQueries({
        queryKey: [...queryKeys.root(tenant.teamId), "employees"],
      });
      router.push(`/people/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create employee");
      setSubmitting(false);
    }
  }

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
        <h1 className="mt-3 nexus-app-title text-balance text-atmospheric-grey">Add employee</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Add someone to the company roster. This is not a workspace invite — use
          Team for that.
        </p>
      </header>

      <section className="app-glass-card rounded-xl p-5 sm:p-6">
        <EmployeeForm
          submitting={submitting}
          error={error}
          onSubmit={handleSubmit}
        />
      </section>
    </div>
  );
}
