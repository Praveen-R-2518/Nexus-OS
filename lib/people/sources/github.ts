import type {
  CandidateSource,
  NormalizedCandidate,
  SourceErr,
  SourceFetchRef,
  SourceFetchResult,
  SourceOk,
} from "@/lib/people/sources/types";
import {
  EMAIL_RE,
  SOURCE_FIELD_LIMITS,
  boundedString,
  isRecord,
  parseConsent,
  sourceFail,
  sourceOk,
} from "@/lib/people/sources/fields";
import { parseSourceMetadata } from "@/lib/people/sources/metadata";

export const GITHUB_USERS_API = "https://api.github.com/users";
export const GITHUB_FETCH_TIMEOUT_MS = 8_000;
export const GITHUB_USER_AGENT = "Nexus-OS-people";
export const GITHUB_API_VERSION = "2022-11-28";

const GITHUB_LOGIN_MAX = 39;
const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

const RESERVED_PROFILE_PATHS = new Set([
  "search",
  "orgs",
  "organizations",
  "gist",
  "gists",
  "settings",
  "notifications",
  "explore",
  "marketplace",
  "login",
  "signup",
  "topics",
  "features",
  "pricing",
  "about",
  "security",
  "new",
  "stars",
  "trending",
  "users",
]);

const NOREPLY_EMAIL = "users.noreply.github.com";

function isGithubLogin(value: string): boolean {
  return (
    value.length <= GITHUB_LOGIN_MAX &&
    GITHUB_LOGIN_RE.test(value)
  );
}

function profileUrl(login: string): string {
  return `https://github.com/${login}`;
}

export function parseGithubRef(
  raw: string,
): SourceOk<SourceFetchRef> | SourceErr {
  if (typeof raw !== "string") return sourceFail("GitHub ref must be a string");
  const trimmed = raw.trim();
  if (!trimmed) return sourceFail("GitHub ref is required");

  const looksLikeUrl =
    /[./:]/.test(trimmed) || /^https?:\/\//i.test(trimmed);
  if (!looksLikeUrl) {
    if (!isGithubLogin(trimmed)) return sourceFail("Invalid GitHub username");
    return sourceOk({
      externalId: trimmed.toLowerCase(),
      url: profileUrl(trimmed),
    });
  }

  let urlText = trimmed;
  if (!/^https?:\/\//i.test(urlText)) {
    urlText = `https://${urlText.replace(/^\/+/, "")}`;
  }

  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return sourceFail("Invalid GitHub URL");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "gist.github.com") {
    return sourceFail("Gist URLs are not profile refs");
  }
  if (host !== "github.com") {
    return sourceFail("Only github.com profile URLs are allowed");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return sourceFail("GitHub profile URL is missing a username");
  }
  if (parts.length > 1) {
    return sourceFail("GitHub repository URLs are not profile refs");
  }

  const login = parts[0] ?? "";
  if (RESERVED_PROFILE_PATHS.has(login.toLowerCase())) {
    return sourceFail("Not a GitHub profile URL");
  }
  if (url.searchParams.has("q") || url.searchParams.has("type") || url.searchParams.has("query")) {
    return sourceFail("GitHub search URLs are not profile refs");
  }
  if (!isGithubLogin(login)) return sourceFail("Invalid GitHub username");

  return sourceOk({
    externalId: login.toLowerCase(),
    url: profileUrl(login),
  });
}

function usersApiUrl(login: string): string {
  return `${GITHUB_USERS_API}/${encodeURIComponent(login)}`;
}

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

export async function fetchGithubUser(
  ref: SourceFetchRef,
): Promise<SourceFetchResult> {
  const login = ref.externalId.trim().toLowerCase();
  if (!isGithubLogin(login)) {
    return { ok: false, error: "Invalid GitHub username" };
  }

  let response: Response;
  try {
    response = await fetch(usersApiUrl(login), {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": GITHUB_USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      return { ok: false, error: "GitHub request timed out" };
    }
    return { ok: false, error: "GitHub fetch failed" };
  }

  if (response.status === 404) {
    return { ok: false, error: "GitHub user not found" };
  }
  if (response.status === 403) {
    return { ok: false, error: "GitHub rate limited" };
  }
  if (!response.ok) {
    return { ok: false, error: "GitHub fetch failed" };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return { ok: false, error: "GitHub fetch failed" };
  }
  if (!isRecord(raw)) {
    return { ok: false, error: "GitHub fetch failed" };
  }
  return { ok: true, raw };
}

function parseGithubId(raw: unknown): SourceOk<number | null> | SourceErr {
  if (raw === undefined || raw === null) return sourceOk(null);
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
    return sourceFail("github id must be a positive integer");
  }
  return sourceOk(raw);
}

function parseGithubEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, SOURCE_FIELD_LIMITS.email);
  if (!trimmed) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  if (trimmed.toLowerCase().endsWith(`@${NOREPLY_EMAIL}`)) return null;
  return trimmed;
}

function parseHtmlUrl(raw: unknown, login: string): string {
  if (typeof raw !== "string") return profileUrl(login);
  const trimmed = raw.trim();
  if (!trimmed) return profileUrl(login);
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "github.com") return profileUrl(login);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return profileUrl(login);
    }
    return boundedString(trimmed, SOURCE_FIELD_LIMITS.source_url) ?? profileUrl(login);
  } catch {
    return profileUrl(login);
  }
}

export const githubSource: CandidateSource = {
  id: "github",
  label: "GitHub profile",
  defaultConsent: "unknown",
  parseRef: parseGithubRef,
  fetch: fetchGithubUser,
  normalize(raw: unknown) {
    if (!isRecord(raw)) {
      return sourceFail("GitHub normalize expects a profile object");
    }

    const loginRaw = typeof raw.login === "string" ? raw.login.trim() : "";
    if (!loginRaw || !isGithubLogin(loginRaw)) {
      return sourceFail("GitHub profile login is required");
    }

    const fullName =
      boundedString(raw.name, SOURCE_FIELD_LIMITS.full_name) ?? loginRaw;

    const githubId = parseGithubId(raw.id);
    if (!githubId.ok) return githubId;

    const bio =
      typeof raw.bio === "string"
        ? boundedString(raw.bio, SOURCE_FIELD_LIMITS.notes)
        : null;
    const headline = bio
      ? bio.slice(0, SOURCE_FIELD_LIMITS.headline)
      : null;
    const location =
      typeof raw.location === "string"
        ? boundedString(raw.location, SOURCE_FIELD_LIMITS.location)
        : null;

    const consent = parseConsent(raw.consent_status, "unknown");
    if (!consent.ok) return consent;

    const externalId = loginRaw.toLowerCase();
    const metadata: Record<string, unknown> = {
      adapter: "github",
      external_id: externalId,
    };
    if (githubId.data !== null) {
      metadata.github_id = githubId.data;
    }

    const parsedMeta = parseSourceMetadata(metadata);
    if (!parsedMeta.ok) return parsedMeta;

    const record: NormalizedCandidate = {
      full_name: fullName,
      email: parseGithubEmail(raw.email),
      phone: null,
      headline,
      current_role: null,
      experience_years: null,
      skills: [],
      location,
      source: "github",
      source_url: parseHtmlUrl(raw.html_url, loginRaw),
      source_metadata: parsedMeta.data,
      consent_status: consent.data,
      notes: bio,
      external_id: externalId,
    };
    return sourceOk(record);
  },
};
