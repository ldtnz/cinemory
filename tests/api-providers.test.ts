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
const calls: string[] = [];

mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });
mock.module("@/lib/tmdb", {
  namedExports: {
    isTmdbConfigured: () => tmdbConfigured,
    fetchWatchProviders: async (tmdbId: number, mediaType: string) => {
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
  assert.deepEqual(providers["1"], ["Netflix", "Disney Plus"]);
  assert.deepEqual(providers["2"], []);
  assert.deepEqual(providers["3"], ["Amazon Prime Video"]);
  assert.deepEqual(calls.sort(), ["Movie:1", "Movie:2", "Series:3"]);
});

test("asking again does not reach TMDB again", async () => {
  calls.length = 0;
  const res = await ask([
    { tmdbId: 1, mediaType: "Movie" },
    { tmdbId: 2, mediaType: "Movie" },
  ]);
  const { providers } = (await res.json()) as { providers: Record<string, string[]> };
  assert.deepEqual(providers["1"], ["Netflix", "Disney Plus"]);
  // The one with nowhere to watch it is cached too, or it would be asked
  // about on every scroll for ever.
  assert.deepEqual(providers["2"], []);
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
