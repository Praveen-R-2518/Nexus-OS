import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { explainMatchScore } from "@/lib/ai/people-explain";
import { isMockMode } from "@/lib/ai/provider";
import { writeSystemAuditEvent } from "@/lib/audit";
import {
  complete,
  fail,
  refreshLock,
  requeueExplainContinuation,
  setProgress,
  type BackgroundJob,
} from "@/lib/people/background-jobs";
import { embedApplicationSummaries } from "@/lib/people/embed";
import {
  buildAiExplanationErrorPatch,
  buildAiExplanationPatch,
  hasValidMatchExplanation,
  PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION,
  type ExplainCandidateContext,
  type ExplainJobContext,
} from "@/lib/people/match-explanation";
import type { ApplicationSummaryInput } from "@/lib/people/summaries";
import {
  isScoreSufficient,
  scoreCandidate,
  SCORING_VERSION,
  type ScoreCandidateInput,
  type ScoreJobInput,
  type ScoreResult,
} from "@/lib/people/score";
import { parseStoredWeights } from "@/lib/people/scoring-weights";
import type { CandidateJobDataQuality, RemotePolicy } from "@/types";

export const MATCH_BATCH_SIZE = 100;
export const MAX_EXPLAINS_PER_INVOCATION = 25;

type CandidateScoreRow = {
  id: string;
  full_name: string | null;
  skills: unknown;
  experience_years: unknown;
  current_role: string | null;
  headline: string | null;
  location: string | null;
  archived_at: string | null;
};

type CandidateJobRow = {
  id: string;
  candidate_id: string;
  stage: string | null;
};

type CandidateJobExplainRow = {
  id: string;
  candidate_id: string;
  stage: string | null;
  match_score: unknown;
  match_components: unknown;
  match_weights_used: unknown;
  scoring_version: string | null;
  data_quality: CandidateJobDataQuality;
  insufficient_reason: string | null;
  ai_explanation: unknown;
};

type JobScoreRow = {
  id: string;
  title: string | null;
  required_skills: unknown;
  preferred_skills: unknown;
  experience_min_years: unknown;
  experience_max_years: unknown;
  seniority: string | null;
  location: string | null;
  remote_policy: RemotePolicy | null;
  scoring_weights: unknown;
  scoring_weights_version: number | null;
};

export type PeopleMatchProgress = {
  processed: number;
  scored: number;
  insufficient: number;
  skipped: number;
  total: number;
  scoring_version: string;
  scoring_weights_version: number;
  explained: number;
  explain_failed: number;
  explain_skipped: number;
  prompt_version: string;
};

function parsePeopleMatchJobId(payload: Record<string, unknown>): string | null {
  const jobId = payload.job_id;
  if (typeof jobId !== "string") return null;
  const trimmed = jobId.trim();
  return trimmed || null;
}

function isExplainOnlyPhase(payload: Record<string, unknown>): boolean {
  return payload.phase === "explain";
}

function coerceSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function coerceYears(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toScoreCandidateInput(candidate: CandidateScoreRow): ScoreCandidateInput {
  return {
    skills: coerceSkills(candidate.skills),
    experience_years: coerceYears(candidate.experience_years),
    current_role: candidate.current_role,
    headline: candidate.headline,
    location: candidate.location,
  };
}

function toScoreJobInput(job: JobScoreRow): ScoreJobInput {
  return {
    required_skills: coerceSkills(job.required_skills),
    preferred_skills: coerceSkills(job.preferred_skills),
    experience_min_years: coerceYears(job.experience_min_years),
    experience_max_years: coerceYears(job.experience_max_years),
    seniority: job.seniority,
    location: job.location,
    remote_policy: job.remote_policy,
  };
}

function toExplainJobContext(job: JobScoreRow): ExplainJobContext {
  return {
    title: job.title,
    required_skills: coerceSkills(job.required_skills),
    preferred_skills: coerceSkills(job.preferred_skills),
    experience_min_years: coerceYears(job.experience_min_years),
    experience_max_years: coerceYears(job.experience_max_years),
    seniority: job.seniority,
    location: job.location,
    remote_policy: job.remote_policy,
  };
}

function toExplainCandidateContext(candidate: CandidateScoreRow): ExplainCandidateContext {
  return {
    headline: candidate.headline,
    current_role: candidate.current_role,
    experience_years: coerceYears(candidate.experience_years),
    skills: coerceSkills(candidate.skills),
    location: candidate.location,
  };
}

function buildCandidateJobPatch(
  result: ScoreResult,
  weightsVersion: number,
): Record<string, unknown> {
  const shared = {
    match_weights_used: {
      weights: result.weights,
      weights_version: weightsVersion,
    },
    scoring_version: SCORING_VERSION,
    ai_explanation: null,
    ai_model: null,
    ai_prompt_version: null,
  };

  if (isScoreSufficient(result)) {
    return {
      ...shared,
      match_score: result.score,
      match_components: result.components,
      data_quality: "sufficient",
      insufficient_reason: null,
    };
  }

  return {
    ...shared,
    match_score: null,
    match_components: null,
    data_quality: "insufficient",
    insufficient_reason: result.reason,
  };
}

function emptyProgress(weightsVersion: number, total = 0): PeopleMatchProgress {
  return {
    processed: 0,
    scored: 0,
    insufficient: 0,
    skipped: 0,
    total,
    scoring_version: SCORING_VERSION,
    scoring_weights_version: weightsVersion,
    explained: 0,
    explain_failed: 0,
    explain_skipped: 0,
    prompt_version: PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION,
  };
}

function readPriorProgress(
  job: BackgroundJob,
  weightsVersion: number,
  total: number,
): PeopleMatchProgress {
  const p = job.progress ?? {};
  const num = (key: string): number =>
    typeof p[key] === "number" && Number.isFinite(p[key]) ? (p[key] as number) : 0;

  return {
    processed: num("processed"),
    scored: num("scored"),
    insufficient: num("insufficient"),
    skipped: num("skipped"),
    total: typeof p.total === "number" ? p.total : total,
    scoring_version:
      typeof p.scoring_version === "string" ? p.scoring_version : SCORING_VERSION,
    scoring_weights_version:
      typeof p.scoring_weights_version === "number" ? p.scoring_weights_version : weightsVersion,
    explained: num("explained"),
    explain_failed: num("explain_failed"),
    explain_skipped: num("explain_skipped"),
    prompt_version: PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION,
  };
}

function buildProgressSnapshot(input: PeopleMatchProgress): PeopleMatchProgress {
  return { ...input };
}

function evidenceNotes(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const notes: string[] = [];
  for (const item of components) {
    if (!item || typeof item !== "object") continue;
    const evidence = (item as { evidence?: unknown }).evidence;
    if (!Array.isArray(evidence)) continue;
    for (const ev of evidence) {
      if (!ev || typeof ev !== "object") continue;
      const note = (ev as { note?: unknown }).note;
      if (typeof note === "string" && note.trim()) notes.push(note.trim());
    }
  }
  return notes;
}

function explanationSummaryText(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if ("error" in value) return null;
  const summary = (value as { summary?: unknown }).summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

function applicationEmbedInput(params: {
  candidateName: string;
  jobTitle: string;
  stage: string | null;
  matchScore: unknown;
  dataQuality: CandidateJobDataQuality | string | null;
  insufficientReason: string | null;
  matchComponents: unknown;
  aiExplanation: unknown;
}): ApplicationSummaryInput {
  const matchScore =
    typeof params.matchScore === "number" && Number.isFinite(params.matchScore)
      ? params.matchScore
      : null;
  return {
    candidateName: params.candidateName,
    jobTitle: params.jobTitle,
    stage: params.stage?.trim() || "new",
    matchScore,
    dataQuality: params.dataQuality,
    insufficientReason: params.insufficientReason,
    evidence: evidenceNotes(params.matchComponents),
    explanationSummary: explanationSummaryText(params.aiExplanation),
  };
}

async function runExplainPhase(
  supabase: SupabaseClient,
  job: BackgroundJob,
  targetJobId: string,
  teamId: string,
  peopleJob: JobScoreRow,
  progress: PeopleMatchProgress,
): Promise<{ progress: PeopleMatchProgress; yielded: boolean }> {
  const explainCap = isMockMode() ? Number.POSITIVE_INFINITY : MAX_EXPLAINS_PER_INVOCATION;
  let explainedThisInvocation = 0;
  let yielded = false;
  let offset = 0;

  const jobContext = toExplainJobContext(peopleJob);

  while (true) {
    const { data: applicationRows, error: batchError } = await supabase
      .from("candidate_jobs")
      .select(
        "id, candidate_id, stage, match_score, match_components, match_weights_used, scoring_version, data_quality, insufficient_reason, ai_explanation",
      )
      .eq("job_id", targetJobId)
      .eq("team_id", teamId)
      .in("data_quality", ["sufficient", "insufficient"])
      .order("id", { ascending: true })
      .range(offset, offset + MATCH_BATCH_SIZE - 1);

    if (batchError) {
      throw new Error("explain_write_failed");
    }

    const rows = (applicationRows ?? []) as CandidateJobExplainRow[];
    if (rows.length === 0) break;

    const candidateIds = [...new Set(rows.map((row) => row.candidate_id))];
    const { data: candidateRows, error: candidateError } = await supabase
      .from("candidates")
      .select(
        'id, full_name, skills, experience_years, "current_role", headline, location, archived_at',
      )
      .eq("team_id", teamId)
      .in("id", candidateIds);

    if (candidateError) {
      throw new Error("explain_write_failed");
    }

    const candidateById = new Map(
      ((candidateRows ?? []) as CandidateScoreRow[]).map((candidate) => [
        candidate.id,
        candidate,
      ]),
    );

    const pendingEmbeds: Array<{
      sourceId: string;
      input: ApplicationSummaryInput;
    }> = [];

    for (const row of rows) {
      if (explainedThisInvocation >= explainCap) {
        yielded = true;
        break;
      }

      if (hasValidMatchExplanation(row.ai_explanation)) {
        progress.explain_skipped += 1;
        const existing = candidateById.get(row.candidate_id);
        if (existing && !existing.archived_at) {
          pendingEmbeds.push({
            sourceId: row.id,
            input: applicationEmbedInput({
              candidateName: existing.full_name?.trim() || "Candidate",
              jobTitle: peopleJob.title?.trim() || "Job",
              stage: row.stage,
              matchScore: row.match_score,
              dataQuality: row.data_quality,
              insufficientReason: row.insufficient_reason,
              matchComponents: row.match_components,
              aiExplanation: row.ai_explanation,
            }),
          });
        }
        continue;
      }

      const candidate = candidateById.get(row.candidate_id);
      if (!candidate || candidate.archived_at) {
        progress.explain_skipped += 1;
        continue;
      }

      const matchScore =
        typeof row.match_score === "number" && Number.isFinite(row.match_score)
          ? row.match_score
          : null;

      const result = await explainMatchScore({
        job: jobContext,
        candidate: toExplainCandidateContext(candidate),
        scoring: {
          scoring_version: row.scoring_version,
          data_quality: row.data_quality,
          match_score: matchScore,
          insufficient_reason: row.insufficient_reason,
          match_components: row.match_components,
          match_weights_used: row.match_weights_used,
        },
        teamId,
        workspaceId: job.workspaceId,
        supabase,
      });

      if (result.status === "error" && result.error === "budget_exceeded") {
        progress.explain_skipped += 1;
        pendingEmbeds.push({
          sourceId: row.id,
          input: applicationEmbedInput({
            candidateName: candidate.full_name?.trim() || "Candidate",
            jobTitle: peopleJob.title?.trim() || "Job",
            stage: row.stage,
            matchScore: row.match_score,
            dataQuality: row.data_quality,
            insufficientReason: row.insufficient_reason,
            matchComponents: row.match_components,
            aiExplanation: row.ai_explanation,
          }),
        });
        continue;
      }

      const patch =
        result.status === "success"
          ? buildAiExplanationPatch(result.explanation, result.model)
          : buildAiExplanationErrorPatch(result.error, result.message, result.model);

      const { error: updateError } = await supabase
        .from("candidate_jobs")
        .update(patch)
        .eq("id", row.id)
        .eq("team_id", teamId);

      if (updateError) {
        throw new Error("explain_write_failed");
      }

      if (result.status === "success") progress.explained += 1;
      else progress.explain_failed += 1;

      pendingEmbeds.push({
        sourceId: row.id,
        input: applicationEmbedInput({
          candidateName: candidate.full_name?.trim() || "Candidate",
          jobTitle: peopleJob.title?.trim() || "Job",
          stage: row.stage,
          matchScore: row.match_score,
          dataQuality: row.data_quality,
          insufficientReason: row.insufficient_reason,
          matchComponents: row.match_components,
          aiExplanation:
            result.status === "success" ? result.explanation : row.ai_explanation,
        }),
      });

      explainedThisInvocation += 1;
      await refreshLock(supabase, job.id, job.lockedBy ?? undefined);
      await setProgress(supabase, job.id, buildProgressSnapshot(progress));
    }

    await embedApplicationSummaries(
      { supabase, teamId, workspaceId: job.workspaceId },
      pendingEmbeds,
    );

    if (yielded || rows.length < MATCH_BATCH_SIZE) break;
    offset += MATCH_BATCH_SIZE;
  }

  return { progress, yielded };
}

export async function handlePeopleMatch(
  supabase: SupabaseClient,
  job: BackgroundJob,
): Promise<{ status: "completed" | "failed"; error?: string }> {
  const targetJobId = parsePeopleMatchJobId(job.payload);
  if (!targetJobId) {
    await fail(supabase, job.id, "invalid_payload");
    return { status: "failed", error: "invalid_payload" };
  }

  const explainOnly = isExplainOnlyPhase(job.payload);
  const teamId = job.teamId;

  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .select(
      "id, title, required_skills, preferred_skills, experience_min_years, experience_max_years, seniority, location, remote_policy, scoring_weights, scoring_weights_version",
    )
    .eq("id", targetJobId)
    .eq("team_id", teamId)
    .maybeSingle();

  if (jobError || !jobRow) {
    await fail(supabase, job.id, "job_not_found");
    return { status: "failed", error: "job_not_found" };
  }

  const peopleJob = jobRow as JobScoreRow;
  const weights = parseStoredWeights(peopleJob.scoring_weights);
  if (!weights) {
    await fail(supabase, job.id, "invalid_weights");
    return { status: "failed", error: "invalid_weights" };
  }

  const weightsVersion =
    typeof peopleJob.scoring_weights_version === "number"
      ? peopleJob.scoring_weights_version
      : 1;

  const { data: idRows, error: countError } = await supabase
    .from("candidate_jobs")
    .select("id")
    .eq("job_id", targetJobId)
    .eq("team_id", teamId);

  if (countError) {
    await fail(supabase, job.id, "match_write_failed");
    return { status: "failed", error: "match_write_failed" };
  }

  const total = (idRows ?? []).length;
  let progress = explainOnly
    ? readPriorProgress(job, weightsVersion, total)
    : emptyProgress(weightsVersion, total);

  if (!explainOnly) {
    let processed = 0;
    let scored = 0;
    let insufficient = 0;
    let skipped = 0;
    let offset = 0;

    while (true) {
      const { data: applicationRows, error: batchError } = await supabase
        .from("candidate_jobs")
        .select("id, candidate_id, stage")
        .eq("job_id", targetJobId)
        .eq("team_id", teamId)
        .order("id", { ascending: true })
        .range(offset, offset + MATCH_BATCH_SIZE - 1);

      if (batchError) {
        await fail(supabase, job.id, "match_write_failed");
        return { status: "failed", error: "match_write_failed" };
      }

      const rows = (applicationRows ?? []) as CandidateJobRow[];
      if (rows.length === 0) break;

      const candidateIds = [...new Set(rows.map((row) => row.candidate_id))];
      const { data: candidateRows, error: candidateError } = await supabase
        .from("candidates")
        .select(
          'id, full_name, skills, experience_years, "current_role", headline, location, archived_at',
        )
        .eq("team_id", teamId)
        .in("id", candidateIds);

      if (candidateError) {
        await fail(supabase, job.id, "match_write_failed");
        return { status: "failed", error: "match_write_failed" };
      }

      const candidateById = new Map(
        ((candidateRows ?? []) as CandidateScoreRow[]).map((candidate) => [
          candidate.id,
          candidate,
        ]),
      );

      const pendingEmbeds: Array<{
        sourceId: string;
        input: ApplicationSummaryInput;
      }> = [];

      for (const row of rows) {
        processed += 1;
        const candidate = candidateById.get(row.candidate_id);
        if (!candidate || candidate.archived_at) {
          skipped += 1;
          continue;
        }

        const result = scoreCandidate(
          toScoreCandidateInput(candidate),
          toScoreJobInput(peopleJob),
          weights,
        );
        const patch = buildCandidateJobPatch(result, weightsVersion);

        const { error: updateError } = await supabase
          .from("candidate_jobs")
          .update(patch)
          .eq("id", row.id)
          .eq("team_id", teamId);

        if (updateError) {
          await fail(supabase, job.id, "match_write_failed");
          return { status: "failed", error: "match_write_failed" };
        }

        if (isScoreSufficient(result)) scored += 1;
        else insufficient += 1;

        pendingEmbeds.push({
          sourceId: row.id,
          input: applicationEmbedInput({
            candidateName: candidate.full_name?.trim() || "Candidate",
            jobTitle: peopleJob.title?.trim() || "Job",
            stage: row.stage,
            matchScore: isScoreSufficient(result) ? result.score : null,
            dataQuality: isScoreSufficient(result) ? "sufficient" : "insufficient",
            insufficientReason: isScoreSufficient(result) ? null : result.reason,
            matchComponents: isScoreSufficient(result) ? result.components : null,
            aiExplanation: null,
          }),
        });
      }

      await embedApplicationSummaries(
        { supabase, teamId, workspaceId: job.workspaceId },
        pendingEmbeds,
      );

      progress = {
        ...progress,
        processed,
        scored,
        insufficient,
        skipped,
        total,
      };
      await refreshLock(supabase, job.id, job.lockedBy ?? undefined);
      await setProgress(supabase, job.id, buildProgressSnapshot(progress));

      if (rows.length < MATCH_BATCH_SIZE) break;
      offset += MATCH_BATCH_SIZE;
    }
  }

  let explainOutcome: { progress: PeopleMatchProgress; yielded: boolean };
  try {
    explainOutcome = await runExplainPhase(
      supabase,
      job,
      targetJobId,
      teamId,
      peopleJob,
      progress,
    );
  } catch {
    await fail(supabase, job.id, "explain_write_failed");
    return { status: "failed", error: "explain_write_failed" };
  }

  const finalProgress = explainOutcome.progress;

  if (explainOutcome.yielded) {
    const requeued = await requeueExplainContinuation(
      supabase,
      job.id,
      teamId,
      targetJobId,
      buildProgressSnapshot(finalProgress),
    );
    return requeued
      ? { status: "completed" }
      : { status: "failed", error: "requeue_failed" };
  }

  const audit = await writeSystemAuditEvent(
    {
      supabase,
      teamId,
      workspaceId: job.workspaceId,
    },
    {
      domain: "people",
      action: "match",
      entityType: "job",
      entityId: targetJobId,
      metadata: {
        background_job_id: job.id,
        processed: finalProgress.processed,
        scored: finalProgress.scored,
        insufficient: finalProgress.insufficient,
        skipped: finalProgress.skipped,
        total: finalProgress.total,
        scoring_version: SCORING_VERSION,
        scoring_weights_version: weightsVersion,
        explained: finalProgress.explained,
        explain_failed: finalProgress.explain_failed,
        prompt_version: PEOPLE_MATCH_EXPLAIN_PROMPT_VERSION,
      },
    },
  );

  if (!audit.ok) {
    await fail(supabase, job.id, "audit_failed");
    return { status: "failed", error: "audit_failed" };
  }

  const ok = await complete(supabase, job.id, buildProgressSnapshot(finalProgress));
  return ok ? { status: "completed" } : { status: "failed", error: "complete_failed" };
}
