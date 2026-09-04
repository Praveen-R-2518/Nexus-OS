export {
  CANDIDATE_SOURCE_IDS,
  isCandidateSourceId,
  SOURCE_METADATA_MAX_BYTES,
  SOURCE_METADATA_MAX_KEYS,
} from "@/lib/people/sources/types";
export type {
  CandidateSource,
  CandidateSourceId,
  NormalizedCandidate,
  SourceErr,
  SourceFetchRef,
  SourceFetchResult,
  SourceMetadata,
  SourceMetadataValue,
  SourceOk,
} from "@/lib/people/sources/types";

export { parseSourceMetadata } from "@/lib/people/sources/metadata";
export { SOURCE_FIELD_LIMITS } from "@/lib/people/sources/fields";
export { csvSource } from "@/lib/people/sources/csv";
export {
  GITHUB_USERS_API,
  fetchGithubUser,
  githubSource,
  parseGithubRef,
} from "@/lib/people/sources/github";
export { manualSource } from "@/lib/people/sources/manual";
export {
  getCandidateSource,
  listCandidateSources,
  requireCandidateSource,
} from "@/lib/people/sources/registry";
