/**
 * Filling in a season count nobody has asked for yet.
 *
 * The count is not something anyone types: TMDB is the source, and the app
 * fetches it by itself. This checks the part that does the fetching — what it
 * writes for each of TMDB's three possible answers. Getting "no answer" wrong
 * is the expensive one: recorded as empty, the series comes back round on the
 * next run, finds the same nothing, and is asked again forever.
 *
 * TMDB is never called: global fetch is replaced per case. The database is,
 * so this runs against the local dev file and cleans up after itself.
 */
import { test, before, after as afterAll, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";
process.env.TMDB_ACCESS_TOKEN ??= "test-token";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Imported inside the hooks rather than at the top: a top-level await here
// turns the file into an async module, which the test runner cannot require.
type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let fillMissingSeasonCounts: typeof import("@/lib/season-check").fillMissingSeasonCounts;
let NO_SEASON_COUNT: number;

/** A throwaway series with no season count, as an old import leaves one. */
let id = 0;
const TMDB_ID = 999_000_001;

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ fillMissingSeasonCounts } = await import("@/lib/season-check"));
  ({ NO_SEASON_COUNT } = await import("@/lib/season-counts"));

  const row = await prisma.title.create({
    data: {
      title: "Season Fill Fixture",
      searchTitle: "seasonfillfixture",
      platform: "Netflix",
      mediaType: "Series",
      status: "Watched",
      inWatchlist: false,
      tmdbId: TMDB_ID,
      totalSeasons: null,
    },
  });
  id = row.id;
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { tmdbId: TMDB_ID } });
  await prisma.$disconnect();
});

function reply(init: { status?: number; body?: unknown } | "network-error") {
  globalThis.fetch = (async () => {
    if (init === "network-error") throw new Error("ECONNRESET");
    const status = init.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => init.body } as Response;
  }) as typeof fetch;
}

const reset = () => prisma.title.update({ where: { id }, data: { totalSeasons: null } });
const stored = async () =>
  (await prisma.title.findUnique({ where: { id }, select: { totalSeasons: true } }))!.totalSeasons;

test("a real answer is stored", async () => {
  await reset();
  reply({ body: { seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }] } });
  const out = await fillMissingSeasonCounts(id - 1, 1);
  assert.equal(await stored(), 2);
  assert.equal(out.completed, 1);
  assert.equal(out.unavailable, 0);
});

test("TMDB having no answer is recorded, so it is not asked again forever", async () => {
  await reset();
  reply({ status: 404, body: {} });
  const out = await fillMissingSeasonCounts(id - 1, 1);
  assert.equal(await stored(), NO_SEASON_COUNT);
  assert.equal(out.unavailable, 1);
  assert.equal(out.completed, 0);
});

test("a request that failed to get through is left to be retried", async () => {
  // The distinction the whole thing turns on: still empty means still queued.
  await reset();
  reply("network-error");
  const out = await fillMissingSeasonCounts(id - 1, 1);
  assert.equal(await stored(), null);
  assert.equal(out.completed, 0);
  assert.equal(out.unavailable, 0);
});

test("a series that already has a count is not in the queue at all", async () => {
  await prisma.title.update({ where: { id }, data: { totalSeasons: 4 } });
  reply({ body: { number_of_seasons: 99 } });
  const out = await fillMissingSeasonCounts(id - 1, 5);
  // Not merely unchanged — never selected, so TMDB was not asked about it.
  assert.equal(await stored(), 4);
  assert.equal(out.scanned, 0);
  await reset();
});

test("the cursor moves on, so a backlog is worked through rather than repeated", async () => {
  await reset();
  reply({ body: { number_of_seasons: 3 } });
  const out = await fillMissingSeasonCounts(id - 1, 1);
  assert.equal(out.lastId, id);
  assert.equal(out.scanned, 1);
});
