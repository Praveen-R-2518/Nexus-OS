import { Suspense } from "react";
import { PeopleEmailComposer } from "@/components/people/PeopleEmailComposer";
import { Spinner } from "@/components/ui/Spinner";

export const dynamic = "force-dynamic";

export default function PeopleEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
          <Spinner className="h-8 w-8" label="Loading composer" />
          <p className="text-sm">Loading composer…</p>
        </div>
      }
    >
      <PeopleEmailComposer />
    </Suspense>
  );
}
