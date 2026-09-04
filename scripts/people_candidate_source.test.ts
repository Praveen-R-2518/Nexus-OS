/**
 * Wave 2 H1/H2 — CandidateSource adapter (parse/normalize stay network-free).
 * Run: npx tsx scripts/people_candidate_source.test.ts
 *      (or `npm run test:people-candidate-source`)
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANDIDATE_SOURCE_IDS,
  GITHUB_USERS_API,
  SOURCE_METADATA_MAX_BYTES,
  csvSource,
  getCandidateSource,
  githubSource,
  listCandidateSources,
  manualSource,
  parseGithubRef,
  parseSourceMetadata,
  requireCandidateSource,
} from "@/lib/people/sources";
import { SOURCE_FIELD_LIMITS } from "@/lib/people/sources/fields";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

let passed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn()).then(() => {
    passed += 1;
    console.log(`  ok  ${name}`);
  });
}

const sourcesDir = join(process.cwd(), "lib/people/sources");

(async () => {
  await check("source modules stay free of server-only / Next; only github.ts may call Users API", () => {
    const files = readdirSync(sourcesDir).filter((name) => name.endsWith(".ts"));
    assert(files.length > 0, "sources dir has ts files");
    for (const name of files) {
      const src = readFileSync(join(sourcesDir, name), "utf8");
      assert(!/from ["']server-only["']/.test(src), `${name} must not import server-only`);
      assert(!/from ["']next\//.test(src), `${name} must not import Next.js`);
      if (name === "github.ts") {
        assert(
          /api\.github\.com\/users/.test(src),
          "github.ts must call the Users API",
        );
        assert(!/\/search\b/.test(src), "github.ts must not call search");
        assert(!/\/followers\b/.test(src), "github.ts must not list followers");
        assert(!/text\/html/.test(src), "github.ts must not scrape HTML");
        continue;
      }
      assert(
        !/api\.github\.com/.test(src),
        `${name} must not call api.github.com`,
      );
    }
  });

  await check("registry resolves known ids and fails closed on unknown", () => {
    const listed = listCandidateSources();
    assert(listed.length === CANDIDATE_SOURCE_IDS.length, "all ids listed");
    assert(listed.map((s) => s.id).join(",") === CANDIDATE_SOURCE_IDS.join(","), "order");
    assert(getCandidateSource("manual") === manualSource, "manual");
    assert(getCandidateSource("csv") === csvSource, "csv");
    assert(getCandidateSource("github") === githubSource, "github");
    assert(getCandidateSource("linkedin") === undefined, "unknown undefined");
    assert(getCandidateSource("search") === undefined, "search not a source");
    const required = requireCandidateSource("nope");
    assert(!required.ok, "require fails");
    if (required.ok) return;
    assert(required.error.includes("Unknown candidate source"), required.error);
    const ok = requireCandidateSource("github");
    assert(ok.ok && ok.data.id === "github", "require github");
  });

  await check("manual normalize defaults consent owner_imported and source manual", () => {
    const result = manualSource.normalize({ full_name: "Ada Lovelace" });
    assert(result.ok, "normalize ok");
    if (!result.ok) return;
    assert(result.data.source === "manual", "source");
    assert(result.data.consent_status === "owner_imported", "consent");
    assert(result.data.email === null, "email optional");
    assert(result.data.skills.length === 0, "skills");
    assert(result.data.external_id === null, "no external id");
    assert(result.data.source_metadata.adapter === "manual", "adapter");
  });

  await check("manual keeps founder source text in original_source", () => {
    const result = manualSource.normalize({
      full_name: "Ada Lovelace",
      source: "Referral",
      email: "ada@example.com",
    });
    assert(result.ok, "ok");
    if (!result.ok) return;
    assert(result.data.source === "manual", "canonical source");
    assert(result.data.source_metadata.original_source === "Referral", "original");
  });

  await check("csv blank source becomes csv; consent defaults owner_imported", () => {
    const result = csvSource.normalize({
      full_name: "Grace Hopper",
      email: "grace@example.com",
      skills: ["COBOL"],
    });
    assert(result.ok, "ok");
    if (!result.ok) return;
    assert(result.data.source === "csv", "source csv");
    assert(result.data.consent_status === "owner_imported", "consent");
    assert(result.data.skills.join(",") === "COBOL", "skills");
    assert(result.data.external_id === "grace@example.com", "email key");
    assert(result.data.source_metadata.original_source === undefined, "no original");
  });

  await check("csv mapped source Indeed is original_source; canonical source stays csv", () => {
    const result = csvSource.normalize({
      full_name: "Grace Hopper",
      source: "Indeed",
    });
    assert(result.ok, "ok");
    if (!result.ok) return;
    assert(result.data.source === "csv", "canonical");
    assert(result.data.source_metadata.original_source === "Indeed", "original");
  });

  await check("GitHub parseRef accepts URL, www, and bare login", () => {
    const a = parseGithubRef("https://github.com/octocat");
    const b = parseGithubRef("github.com/octocat/");
    const c = parseGithubRef("octocat");
    const d = parseGithubRef("https://www.github.com/OctoCat");
    assert(a.ok && a.data.externalId === "octocat", "https");
    assert(b.ok && b.data.externalId === "octocat", "host path");
    assert(c.ok && c.data.externalId === "octocat" && c.data.url === "https://github.com/octocat", "bare");
    assert(d.ok && d.data.externalId === "octocat", "www + case");
  });

  await check("GitHub parseRef rejects search, orgs, gist, and repos", () => {
    const cases = [
      "https://github.com/search?q=octocat",
      "github.com/search",
      "https://github.com/orgs/github",
      "https://gist.github.com/octocat/abc",
      "https://github.com/octocat/Hello-World",
      "octocat/Hello-World",
      "-octocat",
      "octocat-",
      "",
    ];
    for (const raw of cases) {
      const result = parseGithubRef(raw);
      assert(!result.ok, `should reject ${raw}`);
    }
  });

  await check("GitHub normalize uses login when name missing; never invents email", () => {
    const result = githubSource.normalize({
      login: "octocat",
      name: null,
      email: null,
      html_url: "https://github.com/octocat",
      id: 1,
    });
    assert(result.ok, "ok");
    if (!result.ok) return;
    assert(result.data.full_name === "octocat", "login fallback");
    assert(result.data.email === null, "no email");
    assert(result.data.skills.length === 0, "no invented skills");
    assert(result.data.experience_years === null, "no invented years");
    assert(result.data.consent_status === "unknown", "default consent");
    assert(result.data.source === "github", "source");
    assert(result.data.external_id === "octocat", "external id");
    assert(result.data.source_metadata.github_id === 1, "github id");
    assert(result.data.source_url === "https://github.com/octocat", "url");
  });

  await check("GitHub normalize drops noreply and invalid emails; keeps a real email", () => {
    const noreply = githubSource.normalize({
      login: "octocat",
      email: "octocat@users.noreply.github.com",
    });
    assert(noreply.ok && noreply.data.email === null, "noreply dropped");

    const invalid = githubSource.normalize({
      login: "octocat",
      email: "not-an-email",
    });
    assert(invalid.ok && invalid.data.email === null, "invalid dropped");

    const real = githubSource.normalize({
      login: "octocat",
      name: "The Octocat",
      email: "octocat@example.com",
    });
    assert(real.ok && real.data.email === "octocat@example.com", "real email");
    if (!real.ok) return;
    assert(real.data.full_name === "The Octocat", "name");
  });

  await check("GitHub normalize truncates bio for headline and notes", () => {
    const bio = `${"a".repeat(300)}`;
    const result = githubSource.normalize({ login: "octocat", bio });
    assert(result.ok, "ok");
    if (!result.ok) return;
    assert(result.data.headline?.length === SOURCE_FIELD_LIMITS.headline, "headline cap");
    assert(result.data.notes?.length === 300, "notes keep 300");
  });

  await check("GitHub fetch GETs /users/{login} only", async () => {
    const calls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      calls.push(url);
      if (url.includes("/search") || url.includes("/followers")) {
        throw new Error(`forbidden GitHub URL: ${url}`);
      }
      return new Response(
        JSON.stringify({ login: "octocat", id: 1, name: "The Octocat" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    try {
      const result = await githubSource.fetch?.({
        externalId: "octocat",
        url: "https://github.com/octocat",
      });
      assert(result && result.ok, "ok");
      if (!result || !result.ok) return;
      assert(calls.length === 1, "one call");
      assert(calls[0] === `${GITHUB_USERS_API}/octocat`, "users url");
      const raw = result.raw as { login?: unknown };
      assert(raw.login === "octocat", "raw login");
    } finally {
      globalThis.fetch = orig;
    }
  });

  await check("GitHub fetch maps 404 and 403", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("{}", { status: 404 })) as typeof fetch;
    try {
      const missing = await githubSource.fetch?.({
        externalId: "octocat",
        url: "https://github.com/octocat",
      });
      assert(missing && !missing.ok, "404 fails");
      assert(missing && missing.error === "GitHub user not found", "404 message");
    } finally {
      globalThis.fetch = orig;
    }

    globalThis.fetch = (async () =>
      new Response("{}", { status: 403 })) as typeof fetch;
    try {
      const limited = await githubSource.fetch?.({
        externalId: "octocat",
        url: "https://github.com/octocat",
      });
      assert(limited && !limited.ok, "403 fails");
      assert(limited && limited.error === "GitHub rate limited", "403 message");
    } finally {
      globalThis.fetch = orig;
    }
  });

  await check("GitHub fetch does not call the network for an invalid login", async () => {
    let called = false;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const result = await githubSource.fetch?.({
        externalId: "octocat/Hello-World",
        url: "https://github.com/octocat/Hello-World",
      });
      assert(result && !result.ok, "invalid ref fails closed");
      assert(!called, "no network");
    } finally {
      globalThis.fetch = orig;
    }
  });

  await check("source_metadata rejects nested objects, arrays, and oversize payloads", () => {
    const nested = parseSourceMetadata({ adapter: "github", extra: { a: 1 } });
    assert(!nested.ok, "nested");

    const arr = parseSourceMetadata({ adapter: "github", extra: [1, 2] });
    assert(!arr.ok, "array");

    const huge = parseSourceMetadata({
      adapter: "github",
      dump: "x".repeat(SOURCE_METADATA_MAX_BYTES),
    });
    assert(!huge.ok, "oversize");
    if (!huge.ok) {
      assert(huge.error.includes("2048"), huge.error);
    }

    const ok = parseSourceMetadata({
      adapter: "github",
      external_id: "octocat",
      github_id: 1,
    });
    assert(ok.ok, "plain object ok");
  });

  await check("adapters fail closed on missing full_name / login", () => {
    assert(!manualSource.normalize({}).ok, "manual");
    assert(!csvSource.normalize({ email: "a@b.com" }).ok, "csv");
    assert(!githubSource.normalize({ name: "No Login" }).ok, "github");
    assert(!githubSource.normalize("https://github.com/octocat").ok, "string not object");
  });

  console.log(`\npeople-candidate-source: ${passed} checks passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
