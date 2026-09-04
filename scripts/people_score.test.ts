/**
 * Wave 1 D2 — Deterministic scoring engine (pure).
 * Run: npx tsx scripts/people_score.test.ts  (or `npm run test:people-score`)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/people/scoring-weights";
import {
  SCORING_VERSION,
  componentRawByKey,
  isScoreSufficient,
  scoreCandidate,
  type ScoreJobInput,
  type ScoreCandidateInput,
} from "@/lib/people/score";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const baseCandidate: ScoreCandidateInput = {
  skills: ["TypeScript", "React", "Node.js"],
  experience_years: 5,
  current_role: "Senior Software Engineer",
  headline: "Full-stack engineer",
  location: "San Francisco, CA",
};

const baseJob: ScoreJobInput = {
  required_skills: ["TypeScript", "React"],
  preferred_skills: ["Node.js", "PostgreSQL"],
  experience_min_years: 3,
  experience_max_years: 8,
  seniority: "senior",
  location: "San Francisco",
  remote_policy: "onsite",
};

check("score module stays pure (no server-only / next imports)", () => {
  const src = readFileSync(join(process.cwd(), "lib/people/score.ts"), "utf8");
  assert(!/from ["']server-only["']/.test(src), "must not import server-only");
  assert(!/from ["']next\//.test(src), "must not import Next.js");
});

check("full match returns high score with SCORING_VERSION and six components", () => {
  const result = scoreCandidate(baseCandidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(result.scoring_version === SCORING_VERSION, "version");
  assert(result.components.length === 6, "six components");
  assert(result.score >= 90, `score was ${result.score}`);
  assert(componentRawByKey(result, "technical_fit") === 100, "technical 100");
  assert(componentRawByKey(result, "experience_fit") === 100, "experience 100");
  assert(componentRawByKey(result, "seniority_fit") === 100, "seniority 100");
  assert(componentRawByKey(result, "location_fit") === 100, "location 100");
  assert(componentRawByKey(result, "nice_to_have") === 50, "nice_to_have 50");
});

check("partial required skills scores technical_fit as matched/required * 100", () => {
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    skills: ["TypeScript"],
  };
  const result = scoreCandidate(candidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "technical_fit") === 50, "1 of 2 required");
});

check("remote job scores location_fit 100 even when cities differ", () => {
  const job: ScoreJobInput = {
    ...baseJob,
    remote_policy: "remote",
    location: "New York",
  };
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    location: "Austin, TX",
  };
  const result = scoreCandidate(candidate, job, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "location_fit") === 100, "remote policy");
});

check("onsite location mismatch scores location_fit 0", () => {
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    location: "Austin, TX",
  };
  const result = scoreCandidate(candidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "location_fit") === 0, "onsite mismatch");
});

check("empty skills and missing years with job requiring both returns insufficient", () => {
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    skills: [],
    experience_years: null,
  };
  const result = scoreCandidate(candidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(!isScoreSufficient(result), "expected insufficient");
  if (isScoreSufficient(result)) return;
  assert(result.data_quality === "insufficient", "insufficient gate");
  assert(!("score" in result), "no numeric score");
  assert(result.reason.includes("skills"), "skills reason");
  assert(result.reason.includes("experience"), "experience reason");
});

check("empty skills but years present is sufficient with technical_fit 0", () => {
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    skills: [],
    experience_years: 5,
  };
  const result = scoreCandidate(candidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "technical_fit") === 0, "no invented skills");
});

check("changing weights changes total while raw components stay the same", () => {
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    skills: ["TypeScript"],
  };
  const defaultResult = scoreCandidate(candidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  const altWeights = {
    ...DEFAULT_SCORING_WEIGHTS,
    technical_fit: 0.1,
    nice_to_have: 0.4,
  };
  const altResult = scoreCandidate(candidate, baseJob, altWeights);
  assert(isScoreSufficient(defaultResult) && isScoreSufficient(altResult), "both sufficient");
  if (!isScoreSufficient(defaultResult) || !isScoreSufficient(altResult)) return;
  assert(
    componentRawByKey(defaultResult, "technical_fit") ===
      componentRawByKey(altResult, "technical_fit"),
    "same technical raw",
  );
  assert(defaultResult.score !== altResult.score, "totals differ");
});

check("preferred-only gap hits nice_to_have not technical_fit", () => {
  const job: ScoreJobInput = {
    ...baseJob,
    required_skills: ["TypeScript", "React"],
    preferred_skills: ["PostgreSQL", "GraphQL"],
  };
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    skills: ["TypeScript", "React"],
  };
  const result = scoreCandidate(candidate, job, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "technical_fit") === 100, "required met");
  assert(componentRawByKey(result, "nice_to_have") === 0, "preferred missing");
});

check("experience below minimum scales down experience_fit", () => {
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    experience_years: 1.5,
  };
  const job: ScoreJobInput = {
    ...baseJob,
    experience_min_years: 3,
    experience_max_years: null,
  };
  const result = scoreCandidate(candidate, job, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "experience_fit") === 50, "1.5/3 = 50");
});

check("experience in range scores experience_fit 100", () => {
  const result = scoreCandidate(baseCandidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "experience_fit") === 100, "in range");
});

check("experience above maximum applies mild overqualified penalty", () => {
  const candidate: ScoreCandidateInput = {
    ...baseCandidate,
    experience_years: 12,
  };
  const job: ScoreJobInput = {
    ...baseJob,
    experience_min_years: 3,
    experience_max_years: 8,
  };
  const result = scoreCandidate(candidate, job, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "expected sufficient");
  if (!isScoreSufficient(result)) return;
  assert(componentRawByKey(result, "experience_fit") === 70, "4 years over max");
});

check("seniority match scores 100; mismatch scores lower", () => {
  const match = scoreCandidate(baseCandidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(match), "match sufficient");
  if (!isScoreSufficient(match)) return;
  assert(componentRawByKey(match, "seniority_fit") === 100, "senior match");

  const mismatchCandidate: ScoreCandidateInput = {
    ...baseCandidate,
    current_role: "Junior Developer",
    headline: "Entry level engineer",
  };
  const mismatch = scoreCandidate(mismatchCandidate, baseJob, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(mismatch), "mismatch sufficient");
  if (!isScoreSufficient(mismatch)) return;
  assert(
    (componentRawByKey(mismatch, "seniority_fit") ?? 0) < 100,
    "seniority mismatch penalized",
  );
});

check("job with no required skills and no experience bounds is evaluable", () => {
  const job: ScoreJobInput = {
    required_skills: [],
    preferred_skills: [],
    experience_min_years: null,
    experience_max_years: null,
    seniority: null,
    location: null,
    remote_policy: null,
  };
  const candidate: ScoreCandidateInput = {
    skills: [],
    experience_years: null,
    current_role: null,
    headline: null,
    location: null,
  };
  const result = scoreCandidate(candidate, job, DEFAULT_SCORING_WEIGHTS);
  assert(isScoreSufficient(result), "evaluable without abort");
});

check("invalid weights throw", () => {
  let threw = false;
  try {
    scoreCandidate(baseCandidate, baseJob, {
      ...DEFAULT_SCORING_WEIGHTS,
      technical_fit: 0.9,
    });
  } catch {
    threw = true;
  }
  assert(threw, "invalid weights must throw");
});

console.log(`\n${passed} checks passed`);
