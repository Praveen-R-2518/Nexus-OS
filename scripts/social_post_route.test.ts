/**
 * GET /api/internal/n8n/social-post — signed media URL for WF8b.
 * Run: npx tsx scripts/social_post_route.test.ts
 */

import Module from "node:module";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const TOKEN = "test-ingest-token";
const ORG = "9f1c1b2a-0000-4000-8000-abcabcabcabc";
const POST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

process.env.N8N_INGEST_TOKEN = TOKEN;

const postRow = {
  id: POST,
  organization_id: ORG,
  platforms: ["instagram"],
  captions: { instagram: { caption: "Hello world", hashtags: ["nexus"] } },
  media_url: `${ORG}/img.png`,
  user_description: "Hello world",
  status: "publishing",
};

const fakeClient = {
  from(table: string) {
    assert(table === "social_posts", `unexpected table ${table}`);
    const filters: Array<[string, unknown]> = [];
    const chain = {
      select() {
        return chain;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return chain;
      },
      maybeSingle() {
        const hit =
          filters.every(([c, v]) => (postRow as Record<string, unknown>)[c] === v)
            ? postRow
            : null;
        return Promise.resolve({ data: hit, error: null });
      },
    };
    return chain;
  },
  storage: {
    from(bucket: string) {
      assert(bucket === "post-media", `unexpected bucket ${bucket}`);
      return {
        createSignedUrl(path: string) {
          return Promise.resolve({
            data: { signedUrl: `https://cdn.test/${path}?sig=1` },
            error: null,
          });
        },
      };
    },
  },
};

const moduleWithLoad = Module as unknown as { _load: (...args: unknown[]) => unknown };
const origLoad = moduleWithLoad._load;
moduleWithLoad._load = function (this: unknown, ...args: unknown[]) {
  const request = args[0] as string;
  if (request === "server-only") return {};
  if (request === "@/lib/supabase") {
    return { createServerClient: () => fakeClient, createBrowserClient: () => ({}) };
  }
  return origLoad.apply(this, args);
};

async function main() {
  const { GET } = await import("@/app/api/internal/n8n/social-post/route");

  const unauthorized = await GET(
    new Request(
      `https://app.test/api/internal/n8n/social-post?organization_id=${ORG}&post_id=${POST}`,
    ),
  );
  assert(unauthorized.status === 401, "missing token -> 401");

  const bad = await GET(
    new Request("https://app.test/api/internal/n8n/social-post?organization_id=nope&post_id=nope", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
  );
  assert(bad.status === 400, "invalid ids -> 400");

  const ok = await GET(
    new Request(
      `https://app.test/api/internal/n8n/social-post?organization_id=${ORG}&post_id=${POST}`,
      { headers: { authorization: `Bearer ${TOKEN}` } },
    ),
  );
  assert(ok.status === 200, `valid request -> 200, got ${ok.status}`);
  const body = (await ok.json()) as {
    success: boolean;
    data: { media_signed_url: string; composed_captions: Record<string, string> };
  };
  assert(body.success, "success true");
  assert(body.data.media_signed_url.includes("sig=1"), "signed URL returned");
  assert(
    body.data.composed_captions.instagram.includes("#nexus"),
    "hashtags composed into caption",
  );

  console.log("social_post_route.test.ts: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
