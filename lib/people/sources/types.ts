/**
 * CandidateSource adapter types. github.fetch may call the Users API.
 * Do not add search/list (that invites scrape).
 */

import {
  CANDIDATE_SOURCE_IDS,
  type CandidateSourceId,
  type ConsentStatus,
} from "@/types";

export { CANDIDATE_SOURCE_IDS };
export type { CandidateSourceId, ConsentStatus };

export const SOURCE_METADATA_MAX_BYTES = 2048;
export const SOURCE_METADATA_MAX_KEYS = 20;

export type SourceMetadataValue = string | number | boolean | null;
export type SourceMetadata = Record<string, SourceMetadataValue>;

export type SourceErr = { ok: false; error: string };
export type SourceOk<T> = { ok: true; data: T };

export type SourceFetchRef = {
  externalId: string;
  url?: string;
};

export type SourceFetchResult =
  | { ok: true; raw: unknown }
  | { ok: false; error: string };

export type NormalizedCandidate = {
  full_name: string;
  email: string | null;
  phone: string | null;
  headline: string | null;
  current_role: string | null;
  experience_years: number | null;
  skills: string[];
  location: string | null;
  source: CandidateSourceId;
  source_url: string | null;
  source_metadata: SourceMetadata;
  consent_status: ConsentStatus;
  notes: string | null;
  /** Adapter-scoped id for H2 idempotency (GitHub login). Not a DB column. */
  external_id: string | null;
};

export type CandidateSource = {
  id: CandidateSourceId;
  label: string;
  defaultConsent: ConsentStatus;
  normalize(raw: unknown): SourceOk<NormalizedCandidate> | SourceErr;
  parseRef?(raw: string): SourceOk<SourceFetchRef> | SourceErr;
  fetch?(ref: SourceFetchRef): Promise<SourceFetchResult>;
};

export function isCandidateSourceId(value: unknown): value is CandidateSourceId {
  return (
    typeof value === "string" &&
    (CANDIDATE_SOURCE_IDS as readonly string[]).includes(value)
  );
}
