import {
  CANDIDATE_SOURCE_IDS,
  isCandidateSourceId,
  type CandidateSource,
  type CandidateSourceId,
  type SourceErr,
  type SourceOk,
} from "@/lib/people/sources/types";
import { csvSource } from "@/lib/people/sources/csv";
import { githubSource } from "@/lib/people/sources/github";
import { manualSource } from "@/lib/people/sources/manual";
import { sourceFail, sourceOk } from "@/lib/people/sources/fields";

function sourceById(id: CandidateSourceId): CandidateSource {
  switch (id) {
    case "manual":
      return manualSource;
    case "csv":
      return csvSource;
    case "github":
      return githubSource;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function listCandidateSources(): readonly CandidateSource[] {
  return CANDIDATE_SOURCE_IDS.map(sourceById);
}

export function getCandidateSource(id: string): CandidateSource | undefined {
  if (!isCandidateSourceId(id)) return undefined;
  return sourceById(id);
}

export function requireCandidateSource(
  id: string,
): SourceOk<CandidateSource> | SourceErr {
  const source = getCandidateSource(id);
  if (!source) {
    return sourceFail(
      `Unknown candidate source: ${id}. Allowed: ${CANDIDATE_SOURCE_IDS.join(", ")}`,
    );
  }
  return sourceOk(source);
}
