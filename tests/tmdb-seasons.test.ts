/**
 * How a season lookup reports "no answer".
 *
 * The distinction this checks is the whole point of the function: a series
 * TMDB genuinely has nothing for must be told apart from a request that did
 * not get through, or the settings page counts it forever — press "Fetch from
 * TMDB", watch nothing happen, press again. Only "none" is safe to record as
 * asked-and-answered.
 *
 * TMDB is never called: global fetch is replaced per case.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";
process.env.TMDB_ACCESS_TOKEN ??= "test-token";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function reply(init: { status?: number; body?: unknown } | "network-error") {
  globalThis.fetch = (async () => {
    if (init === "network-error") throw new Error("ECONNRESET");
    const status = init.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => init.body,
    } as Response;
  }) as typeof fetch;
}

async function lookup(tmdbId = 1399) {
  const { lookupTotalSeasons } = await import("@/lib/tmdb");
  return lookupTotalSeasons(tmdbId);
}

test("a real season list is counted, specials excluded", async () => {
  reply({ body: { seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }] } });
  assert.deepEqual(await lookup(), { status: "ok", totalSeasons: 2 });
});

test("number_of_seasons is the fallback", async () => {
  reply({ body: { number_of_seasons: 8 } });
  assert.deepEqual(await lookup(), { status: "ok", totalSeasons: 8 });
});

test("404 is TMDB's own answer, not a failure", async () => {
  // What a title matched to a film looks like: its tmdbId is not a series.
  reply({ status: 404, body: { status_message: "The resource you requested could not be found." } });
  assert.deepEqual(await lookup(), { status: "none" });
});

test("an answer with no usable season count is also 'none'", async () => {
  reply({ body: { number_of_seasons: 0, seasons: [{ season_number: 0 }] } });
  assert.deepEqual(await lookup(), { status: "none" });
});

test("a rate limit is a failure, to be retried", async () => {
  reply({ status: 429, body: {} });
  assert.deepEqual(await lookup(), { status: "failed" });
});

test("TMDB being down is a failure, to be retried", async () => {
  reply({ status: 503, body: {} });
  assert.deepEqual(await lookup(), { status: "failed" });
});

test("a network error is a failure, to be retried", async () => {
  reply("network-error");
  assert.deepEqual(await lookup(), { status: "failed" });
});

test("an id that is not a TMDB id never asks", async () => {
  reply("network-error");
  assert.deepEqual(await lookup(0), { status: "none" });
  assert.deepEqual(await lookup(-1), { status: "none" });
});

test("the sentinel is negative, so no real count can collide with it", async () => {
  const { NO_SEASON_COUNT } = await import("@/lib/seasons");
  assert.ok(NO_SEASON_COUNT < 0);
});
