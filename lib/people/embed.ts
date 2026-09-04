import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deletePeopleSummaryForSource,
  upsertPeopleSummaryEmbedding,
  upsertPeopleSummaryEmbeddings,
  type PeopleSummaryEmbedItem,
} from "@/lib/embeddings/store";
import {
  formatApplicationSummary,
  formatCandidateSummary,
  formatEmployeeSummary,
  formatJobSummary,
  type ApplicationSummaryInput,
} from "@/lib/people/summaries";
import type { Candidate, Employee, Job } from "@/types";

type PeopleEmbedCtx = {
  supabase: SupabaseClient;
  teamId: string;
  workspaceId: string | null;
};

function schedule(task: Promise<unknown>): void {
  void task.catch(() => {
    /* best-effort: persist must not fail because embed failed */
  });
}

/**
 * Fire-and-forget People embedding after employee create/update.
 * Archive deletes the `people_summary` row; unarchive upserts again.
 */
export function scheduleEmployeeSummaryEmbed(
  ctx: PeopleEmbedCtx,
  employee: Employee,
): void {
  if (employee.archived_at) {
    schedule(
      deletePeopleSummaryForSource({
        supabase: ctx.supabase,
        teamId: ctx.teamId,
        sourceId: employee.id,
      }),
    );
    return;
  }
  schedule(
    upsertPeopleSummaryEmbedding({
      supabase: ctx.supabase,
      teamId: ctx.teamId,
      workspaceId: ctx.workspaceId,
      sourceId: employee.id,
      content: formatEmployeeSummary(employee),
      metadata: { domain: "people", entity_type: "employee" },
    }),
  );
}

export function scheduleJobSummaryEmbed(ctx: PeopleEmbedCtx, job: Job): void {
  if (job.archived_at) {
    schedule(
      deletePeopleSummaryForSource({
        supabase: ctx.supabase,
        teamId: ctx.teamId,
        sourceId: job.id,
      }),
    );
    return;
  }
  schedule(
    upsertPeopleSummaryEmbedding({
      supabase: ctx.supabase,
      teamId: ctx.teamId,
      workspaceId: ctx.workspaceId,
      sourceId: job.id,
      content: formatJobSummary(job),
      metadata: { domain: "people", entity_type: "job" },
    }),
  );
}

export function scheduleCandidateSummaryEmbed(
  ctx: PeopleEmbedCtx,
  candidate: Candidate,
): void {
  if (candidate.archived_at) {
    schedule(
      deletePeopleSummaryForSource({
        supabase: ctx.supabase,
        teamId: ctx.teamId,
        sourceId: candidate.id,
      }),
    );
    return;
  }
  schedule(
    upsertPeopleSummaryEmbedding({
      supabase: ctx.supabase,
      teamId: ctx.teamId,
      workspaceId: ctx.workspaceId,
      sourceId: candidate.id,
      content: formatCandidateSummary(candidate),
      metadata: { domain: "people", entity_type: "candidate" },
    }),
  );
}

export async function embedApplicationSummaries(
  ctx: PeopleEmbedCtx,
  items: Array<{ sourceId: string; input: ApplicationSummaryInput }>,
): Promise<void> {
  const rows: PeopleSummaryEmbedItem[] = items
    .map((item) => ({
      sourceId: item.sourceId,
      content: formatApplicationSummary(item.input),
      metadata: { domain: "people", entity_type: "candidate_job" },
    }))
    .filter((row) => row.content.trim().length > 0);
  if (rows.length === 0) return;
  await upsertPeopleSummaryEmbeddings({
    supabase: ctx.supabase,
    teamId: ctx.teamId,
    workspaceId: ctx.workspaceId,
    items: rows,
  });
}
