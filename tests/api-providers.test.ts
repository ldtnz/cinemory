/**
 * "Where can I watch this tonight", for the titles on the watchlist.
 *
 * The answer comes from TMDB, one call per title, so what matters here is the
 * bookkeeping around it: that a screenful is asked for in one request, that
 * the same title is not asked about twice within the cache's lifetime, and
 * that "nowhere" is remembered as firmly as "Netflix" — otherwise every
 * scroll would re-ask about everything TMDB has nothing for.
 *
 * TMDB is mocked, and counts its own calls.
 */
import { test, before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

let authenticated = true;
let tmdbConfigured = true;
let region = "US";
let failed = false;
mock.module("@/lib/settings", { namedExports: { getSettings: async () => ({ region }) } });
const calls: string[] = [];

mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });
mock.module("@/lib/tmdb", {
  namedExports: {
    isTmdbConfigured: () => tmdbConfigured,
    fetchWatchProviders: async (tmdbId: number, mediaType: string, requestedRegion: string) => {
      assert.equal(requestedRegion, region);
      if (failed) throw new Error("Upstream unavailable");
      calls.push(`${mediaType}:${tmdbId}`);
      if (tmdbId === 1) return ["Netflix", "Disney Plus"];
      if (tmdbId === 2) return [];
      return ["Amazon Prime Video"];
    },
  },
});

let POST: typeof import("@/app/api/providers/route").POST;

function ask(items: { tmdbId: number; mediaType: string }[]) {
  return POST(
    new NextRequest("http://localhost/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }),
  );
}

before(async () => {
  ({ POST } = await import("@/app/api/providers/route"));
});

test("without a session it answers nothing", async () => {
  authenticated = false;
  const res = await ask([{ tmdbId: 1, mediaType: "Movie" }]);
  authenticated = true;
  assert.equal(res.status, 401);
  assert.deepEqual(calls, []);
});

test("with no TMDB key it says so", async () => {
  tmdbConfigured = false;
  const res = await ask([{ tmdbId: 1, mediaType: "Movie" }]);
  tmdbConfigured = true;
  assert.equal(res.status, 503);
});

test("a screenful is one request, and each title is asked about once", async () => {
  const res = await ask([
    { tmdbId: 1, mediaType: "Movie" },
    { tmdbId: 2, mediaType: "Movie" },
    { tmdbId: 3, mediaType: "Series" },
  ]);
  assert.equal(res.status, 200);
  const { providers } = (await res.json()) as { providers: Record<string, string[]> };
  assert.deepEqual(providers["US:Movie:1"], ["Netflix", "Disney Plus"]);
  assert.deepEqual(providers["US:Movie:2"], []);
  assert.deepEqual(providers["US:Series:3"], ["Amazon Prime Video"]);
  assert.deepEqual(calls.sort(), ["Movie:1", "Movie:2", "Series:3"]);
});

test("asking again does not reach TMDB again", async () => {
  calls.length = 0;
  const res = await ask([
    { tmdbId: 1, mediaType: "Movie" },
    { tmdbId: 2, mediaType: "Movie" },
  ]);
  const { providers } = (await res.json()) as { providers: Record<string, string[]> };
  assert.deepEqual(providers["US:Movie:1"], ["Netflix", "Disney Plus"]);
  // The one with nowhere to watch it is cached too, or it would be asked
  // about on every scroll for ever.
  assert.deepEqual(providers["US:Movie:2"], []);
  assert.deepEqual(calls, [], "nothing new was fetched");
});

test("the same id as a film and as a series are different questions", async () => {
  calls.length = 0;
  await ask([{ tmdbId: 1, mediaType: "Series" }]);
  assert.deepEqual(calls, ["Series:1"]);
});

test("a title TMDB never matched is left out rather than asked about", async () => {
  calls.length = 0;
  const res = await ask([
    { tmdbId: 0, mediaType: "Movie" },
    { tmdbId: -1, mediaType: "Movie" },
  ]);
  const { providers } = (await res.json()) as { providers: Record<string, string[]> };
  assert.deepEqual(providers, {});
  assert.deepEqual(calls, []);
});


test("region changes cannot reuse another region's answer", async () => {
  calls.length = 0;
  region = "IT";
  try {
    const res = await ask([{ tmdbId: 1, mediaType: "Movie" }]);
    const data = await res.json();
    assert.equal(data.region, "IT");
    assert.deepEqual(data.providers["IT:Movie:1"], ["Netflix", "Disney Plus"]);
    assert.deepEqual(calls, ["Movie:1"]);
  } finally { region = "US"; }
});

test("film and series results with the same id both survive in one response", async () => {
  const res = await ask([{ tmdbId: 1, mediaType: "Movie" }, { tmdbId: 1, mediaType: "Series" }]);
  assert.deepEqual(Object.keys((await res.json()).providers).sort(), ["US:Movie:1", "US:Series:1"]);
});

test("an upstream failure is explicit and is retried on the next request", async () => {
  failed = true;
  try {
    const res = await ask([{ tmdbId: 10, mediaType: "Movie" }]);
    assert.deepEqual((await res.json()).providers, { "US:Movie:10": null });
  } finally { failed = false; }
  const res = await ask([{ tmdbId: 10, mediaType: "Movie" }]);
  assert.deepEqual((await res.json()).providers["US:Movie:10"], ["Amazon Prime Video"]);
});

test("oversized batches are rejected instead of silently truncated", async () => {
  calls.length = 0;
  const res = await ask(Array.from({ length: 121 }, (_, i) => ({ tmdbId: 100 + i, mediaType: "Movie" })));
  assert.equal(res.status, 400);
  assert.deepEqual(calls, []);
});

test("duplicate items in a batch are fetched only once", async () => {
  calls.length = 0;
  await ask([{ tmdbId: 20, mediaType: "Movie" }, { tmdbId: 20, mediaType: "Movie" }]);
  assert.deepEqual(calls, ["Movie:20"]);
});
