import "server-only";

import { enqueuePeopleMatchJob } from "@/lib/people/background-jobs";
import { persistNormalizedCandidate, type CandidateErr } from "@/lib/people/candidates";
import { ensureCandidateJobLink } from "@/lib/people/candidate-jobs";
import type { PeopleTenantContext } from "@/lib/people/employees";
import { getJob } from "@/lib/people/jobs";
import {
  isCandidateSourceId,
  requireCandidateSource,
  type CandidateSource,
  type NormalizedCandidate,
} from "@/lib/people/sources";
import { isRecord } from "@/lib/people/sources/fields";
import {
  GITHUB_IMPORT_CONSENT_STATUSES,
  type Candidate,
  type GithubImportConsentStatus,
} from "@/types";

const BODY_KEYS = ["source", "ref", "consent_status", "job_id"] as const;

export type FromSourceOk = {
  ok: true;
  data: Candidate;
  created: boolean;
  attached: boolean;
};

function fail(status: number, error: string): CandidateErr {
  return { ok: false, status, error };
}

function isErr(value: { ok?: boolean }): value is CandidateErr {
  return value.ok === false;
}

function unknownKeys(
  body: Record<string, unknown>,
  allowed: readonly string[],
): string[] {
  return Object.keys(body).filter((key) => !allowed.includes(key));
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function isGithubImportConsent(
  value: unknown,
): value is GithubImportConsentStatus {
  return (
    typeof value === "string" &&
    (GITHUB_IMPORT_CONSENT_STATUSES as readonly string[]).includes(value)
  );
}

function githubFetchStatus(error: string): number {
  if (error === "GitHub user not found") return 404;
  if (error === "GitHub rate limited") return 403;
  if (error === "Invalid GitHub username") return 400;
  return 502;
}

function parseOptionalJobId(
  raw: unknown,
): { ok: true; jobId: string | null } | CandidateErr {
  if (raw === undefined || raw === null) return { ok: true, jobId: null };
  if (typeof raw !== "string") return fail(400, "job_id must be a string");
  const jobId = raw.trim();
  if (!jobId) return { ok: true, jobId: null };
  return { ok: true, jobId };
}

function parseBody(
  body: Record<string, unknown>,
):
  | {
      ok: true;
      sourceId: string;
      ref: string;
      consent: GithubImportConsentStatus;
      jobId: string | null;
    }
  | CandidateErr {
  const extra = unknownKeys(body, BODY_KEYS);
  if (extra.length > 0) {
    return fail(400, `Unexpected fields: ${extra.join(", ")}`);
  }

  if (typeof body.source !== "string" || !body.source.trim()) {
    return fail(400, "source is required");
  }
  if (typeof body.ref !== "string") {
    return fail(400, "ref is required");
  }
  const ref = body.ref.trim();
  if (!ref) return fail(400, "ref is required");

  if (!hasOwn(body, "consent_status")) {
    return fail(400, "consent_status is required");
  }
  if (body.consent_status === "candidate_applied") {
    return fail(400, "GitHub import cannot mark a candidate as applied");
  }
  if (!isGithubImportConsent(body.consent_status)) {
    return fail(
      400,
      `consent_status must be one of: ${GITHUB_IMPORT_CONSENT_STATUSES.join(", ")}`,
    );
  }

  const jobId = parseOptionalJobId(body.job_id);
  if (isErr(jobId)) return jobId;

  return {
    ok: true,
    sourceId: body.source.trim(),
    ref,
    consent: body.consent_status,
    jobId: jobId.jobId,
  };
}

function requireGithubAdapter(
  sourceId: string,
): { ok: true; adapter: CandidateSource } | CandidateErr {
  const required = requireCandidateSource(sourceId);
  if (!required.ok) return fail(400, required.error);

  const adapter = required.data;
  switch (adapter.id) {
    case "github":
      return { ok: true, adapter };
    case "csv":
    case "manual":
      return fail(400, "Only GitHub profile import is supported");
    default: {
      const _exhaustive: never = adapter.id;
      return fail(400, `Unknown candidate source: ${_exhaustive}`);
    }
  }
}

async function findExistingGithubCandidate(
  ctx: PeopleTenantContext,
  record: NormalizedCandidate,
): Promise<{ ok: true; data: Candidate | null } | CandidateErr> {
  if (!record.external_id) return { ok: true, data: null };

  const { data, error } = await ctx.supabase
    .from("candidates")
    .select("*")
    .eq("team_id", ctx.teamId)
    .eq("source", "github")
    .eq("source_metadata->>external_id", record.external_id)
    .is("archived_at", null)
    .maybeSingle();

  if (error) return fail(500, error.message);
  if (!data) return { ok: true, data: null };
  return { ok: true, data: data as Candidate };
}

async function requireActiveJob(
  ctx: PeopleTenantContext,
  jobId: string,
): Promise<{ ok: true } | CandidateErr> {
  const job = await getJob(ctx, jobId);
  if (!job.ok) {
    if (job.status === 404) return fail(404, "Job not found");
    return fail(job.status, job.error);
  }
  if (job.data.archived_at) return fail(404, "Job not found");
  return { ok: true };
}

async function attachToJob(
  ctx: PeopleTenantContext,
  candidateId: string,
  jobId: string,
): Promise<{ ok: true; attached: boolean } | CandidateErr> {
  const job = await requireActiveJob(ctx, jobId);
  if (!job.ok) return job;

  const link = await ensureCandidateJobLink(ctx, candidateId, jobId);
  if (!link.ok) return fail(link.status, link.error);

  const matchJob = await enqueuePeopleMatchJob(ctx, jobId);
  if (!matchJob.ok) return fail(matchJob.status, matchJob.error);

  return { ok: true, attached: link.attached };
}

export async function importCandidateFromSource(
  ctx: PeopleTenantContext,
  body: Record<string, unknown>,
): Promise<FromSourceOk | CandidateErr> {
  const parsed = parseBody(body);
  if (isErr(parsed)) return parsed;

  const adapterResult = requireGithubAdapter(parsed.sourceId);
  if (isErr(adapterResult)) return adapterResult;
  const { adapter } = adapterResult;

  if (!adapter.parseRef || !adapter.fetch) {
    return fail(400, "Only GitHub profile import is supported");
  }

  if (parsed.jobId) {
    const job = await requireActiveJob(ctx, parsed.jobId);
    if (!job.ok) return job;
  }

  const ref = adapter.parseRef(parsed.ref);
  if (!ref.ok) return fail(400, ref.error);

  const fetched = await adapter.fetch(ref.data);
  if (!fetched.ok) return fail(githubFetchStatus(fetched.error), fetched.error);

  const raw = isRecord(fetched.raw)
    ? { ...fetched.raw, consent_status: parsed.consent }
    : fetched.raw;

  const normalized = adapter.normalize(raw);
  if (!normalized.ok) return fail(400, normalized.error);
  if (!isCandidateSourceId(normalized.data.source)) {
    return fail(400, "Unknown candidate source");
  }

  const existing = await findExistingGithubCandidate(ctx, normalized.data);
  if (!existing.ok) return existing;

  let candidate: Candidate;
  let created: boolean;
  if (existing.data) {
    candidate = existing.data;
    created = false;
  } else {
    const persisted = await persistNormalizedCandidate(ctx, normalized.data);
    if (!persisted.ok) return persisted;
    candidate = persisted.data;
    created = true;
  }

  let attached = false;
  if (parsed.jobId) {
    const link = await attachToJob(ctx, candidate.id, parsed.jobId);
    if (!link.ok) return link;
    attached = link.attached;
  }

  return { ok: true, data: candidate, created, attached };
}
