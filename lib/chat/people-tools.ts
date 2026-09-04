import "server-only";

import { listCandidates } from "@/lib/people/candidates";
import { listJobCandidates } from "@/lib/people/candidate-jobs";
import {
  listEmployees,
  type PeopleTenantContext,
} from "@/lib/people/employees";
import { listJobs } from "@/lib/people/jobs";
import {
  CANDIDATE_JOB_STAGES,
  EMPLOYMENT_STATUSES,
  type Candidate,
  type CandidateJobStage,
  type Employee,
  type EmploymentStatus,
  type JobCandidateListItem,
} from "@/types";

/**
 * G2 — closed allowlist of read-only People lookup tools for Chat.
 *
 * Wrappers around listEmployees / listCandidates / listJobs + listJobCandidates.
 * This module must not import update/create/send helpers.
 */

export const PEOPLE_READ_QUERY_MAX = 80;
export const PEOPLE_READ_ROW_LIMIT = 8;

export const PEOPLE_READ_TOOL_NAMES = [
  "search_employees",
  "search_candidates",
  "list_job_pipeline",
] as const;

export type PeopleReadToolName = (typeof PEOPLE_READ_TOOL_NAMES)[number];

export type PeopleReadToolDefinition = {
  type: "function";
  function: {
    name: PeopleReadToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: false;
    };
  };
};

export const PEOPLE_READ_TOOLS: PeopleReadToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_employees",
      description:
        "Look up employees by name. Returns name, role, status, and location only — never email, phone, or notes.",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description: "Name search (max 80 characters).",
          },
          employment_status: {
            type: "string",
            enum: [...EMPLOYMENT_STATUSES],
            description: "Optional employment status filter.",
          },
        },
        required: ["q"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_candidates",
      description:
        "Look up candidates by name, headline, or current role. Returns name, headline, current role, and location only — never email, phone, notes, or URLs.",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description: "Name or role search (max 80 characters).",
          },
        },
        required: ["q"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_job_pipeline",
      description:
        "List ranked candidates for a job title substring. If several jobs match, titles are returned for disambiguation. Returns candidate name, stage, score, and data quality only.",
      parameters: {
        type: "object",
        properties: {
          job: {
            type: "string",
            description: "Job title substring (max 80 characters).",
          },
          stage: {
            type: "string",
            enum: [...CANDIDATE_JOB_STAGES],
            description: "Optional pipeline stage filter.",
          },
        },
        required: ["job"],
        additionalProperties: false,
      },
    },
  },
];

export function isPeopleReadToolName(name: string): name is PeopleReadToolName {
  return (PEOPLE_READ_TOOL_NAMES as readonly string[]).includes(name);
}

export async function executePeopleReadTool(
  name: string,
  rawArgs: unknown,
  ctx: PeopleTenantContext,
): Promise<string> {
  if (!isPeopleReadToolName(name)) {
    return errJson("Unknown tool");
  }

  switch (name) {
    case "search_employees":
      return searchEmployeesTool(rawArgs, ctx);
    case "search_candidates":
      return searchCandidatesTool(rawArgs, ctx);
    case "list_job_pipeline":
      return listJobPipelineTool(rawArgs, ctx);
    default: {
      const _never: never = name;
      return errJson(`Unhandled tool: ${String(_never)}`);
    }
  }
}

type EmployeeToolRow = {
  name: string;
  role_title: string | null;
  employment_status: EmploymentStatus;
  location: string | null;
};

type CandidateToolRow = {
  name: string;
  headline: string | null;
  current_role: string | null;
  location: string | null;
};

type PipelineToolRow = {
  name: string;
  stage: CandidateJobStage;
  match_score: number | null;
  data_quality: string | null;
};

function errJson(error: string): string {
  return JSON.stringify({ error });
}

function parseArgsObject(raw: unknown): Record<string, unknown> | string {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return "Arguments must be an object";
    } catch {
      return "Invalid JSON arguments";
    }
  }
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return "Arguments must be an object";
}

type ParseOk<T> = { ok: true; value: T };
type ParseErr = { ok: false; error: string };

function parseBoundedQuery(value: unknown, field: string): ParseOk<string> | ParseErr {
  if (typeof value !== "string") return { ok: false, error: `${field} is required` };
  const q = value.trim();
  if (!q) return { ok: false, error: `${field} is required` };
  if (q.length > PEOPLE_READ_QUERY_MAX) {
    return {
      ok: false,
      error: `${field} must be at most ${PEOPLE_READ_QUERY_MAX} characters`,
    };
  }
  return { ok: true, value: q };
}

function parseEmploymentStatus(
  value: unknown,
): ParseOk<EmploymentStatus | null> | ParseErr {
  if (value == null || value === "") return { ok: true, value: null };
  if (
    typeof value === "string" &&
    (EMPLOYMENT_STATUSES as readonly string[]).includes(value)
  ) {
    return { ok: true, value: value as EmploymentStatus };
  }
  return { ok: false, error: "employment_status is invalid" };
}

function parseStage(value: unknown): ParseOk<CandidateJobStage | null> | ParseErr {
  if (value == null || value === "") return { ok: true, value: null };
  if (
    typeof value === "string" &&
    (CANDIDATE_JOB_STAGES as readonly string[]).includes(value)
  ) {
    return { ok: true, value: value as CandidateJobStage };
  }
  return { ok: false, error: "stage is invalid" };
}

function projectEmployee(row: Employee): EmployeeToolRow {
  return {
    name: row.full_name,
    role_title: row.role_title,
    employment_status: row.employment_status,
    location: row.location,
  };
}

function projectCandidate(row: Candidate): CandidateToolRow {
  return {
    name: row.full_name,
    headline: row.headline,
    current_role: row.current_role,
    location: row.location,
  };
}

function projectPipelineRow(row: JobCandidateListItem): PipelineToolRow {
  return {
    name: row.candidate.full_name,
    stage: row.stage,
    match_score: row.match_score,
    data_quality: row.data_quality,
  };
}

async function searchEmployeesTool(
  rawArgs: unknown,
  ctx: PeopleTenantContext,
): Promise<string> {
  const args = parseArgsObject(rawArgs);
  if (typeof args === "string") return errJson(args);

  const q = parseBoundedQuery(args.q, "q");
  if (!q.ok) return errJson(q.error);

  const status = parseEmploymentStatus(args.employment_status);
  if (!status.ok) return errJson(status.error);

  const result = await listEmployees(ctx, {
    ok: true,
    q: q.value,
    includeArchived: false,
    employmentStatus: status.value,
    limit: PEOPLE_READ_ROW_LIMIT,
    offset: 0,
  });
  if (!result.ok) return errJson(result.error);

  return JSON.stringify({
    rows: result.data.map(projectEmployee),
    count: result.count,
  });
}

async function searchCandidatesTool(
  rawArgs: unknown,
  ctx: PeopleTenantContext,
): Promise<string> {
  const args = parseArgsObject(rawArgs);
  if (typeof args === "string") return errJson(args);

  const q = parseBoundedQuery(args.q, "q");
  if (!q.ok) return errJson(q.error);

  const result = await listCandidates(ctx, {
    ok: true,
    q: q.value,
    includeArchived: false,
    consentStatus: null,
    limit: PEOPLE_READ_ROW_LIMIT,
    offset: 0,
  });
  if (!result.ok) return errJson(result.error);

  return JSON.stringify({
    rows: result.data.map(projectCandidate),
    count: result.count,
  });
}

async function listJobPipelineTool(
  rawArgs: unknown,
  ctx: PeopleTenantContext,
): Promise<string> {
  const args = parseArgsObject(rawArgs);
  if (typeof args === "string") return errJson(args);

  const jobQ = parseBoundedQuery(args.job, "job");
  if (!jobQ.ok) return errJson(jobQ.error);

  const stage = parseStage(args.stage);
  if (!stage.ok) return errJson(stage.error);

  const jobs = await listJobs(ctx, {
    ok: true,
    q: jobQ.value,
    includeArchived: false,
    status: null,
    limit: PEOPLE_READ_ROW_LIMIT,
    offset: 0,
  });
  if (!jobs.ok) return errJson(jobs.error);

  if (jobs.data.length === 0) {
    return errJson("No job matching that title");
  }
  if (jobs.data.length > 1) {
    return JSON.stringify({
      disambiguate: true,
      jobs: jobs.data.map((job) => ({ title: job.title })),
    });
  }

  const job = jobs.data[0];
  const listed = await listJobCandidates(ctx, job.id, {
    ok: true,
    limit: PEOPLE_READ_ROW_LIMIT,
    offset: 0,
    stage: stage.value,
  });
  if (!listed.ok) return errJson(listed.error);

  return JSON.stringify({
    job: job.title,
    rows: listed.data.map(projectPipelineRow),
    count: listed.count,
  });
}
