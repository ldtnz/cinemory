/**
 * The routes that write a title, driven as routes.
 *
 * Everything under src/lib had tests and everything under src/app/api had
 * none, which is the wrong way round for a catalog that is the only copy of
 * years of history: a lib function returning the wrong number is a wrong
 * number, a route mishandling a body is a row changed or lost. These call the
 * real handlers with a real NextRequest against the local database, so the
 * status codes, the guards and what actually lands in the row are all part of
 * what is checked.
 *
 * Only the session check is mocked — it reads a cookie through next/headers,
 * which needs a request context no test runner provides. Node's module
 * mocking is behind a flag; see the "test" script.
 */
import { test, before, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

let authenticated = true;
mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let POST: typeof import("@/app/api/titles/route").POST;
let PATCH: typeof import("@/app/api/titles/[id]/route").PATCH;
let DELETE: typeof import("@/app/api/titles/[id]/route").DELETE;
let GET: typeof import("@/app/api/titles/[id]/route").GET;

const MARK = "zzroute";
const ids: number[] = [];

function candidate(title: string, extra: Record<string, unknown> = {}) {
  return {
    tmdbId: 5550001,
    title: `${MARK} ${title}`,
    mediaType: "Movie",
    posterUrl: null,
    backdropUrl: null,
    overview: null,
    tmdbRating: null,
    year: 2001,
    genres: null,
    ...extra,
  };
}

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function patch(id: number, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/titles/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

function get(id: number | string) {
  return GET(new NextRequest(`http://localhost/api/titles/${id}`), {
    params: Promise.resolve({ id: String(id) }),
  });
}

async function row(title: string) {
  const found = await prisma.title.findFirst({ where: { title: `${MARK} ${title}` } });
  if (found && !ids.includes(found.id)) ids.push(found.id);
  return found;
}

/** A row put straight into the database, for the edits that need one. */
async function seed(title: string, data: Record<string, unknown> = {}) {
  const created = await prisma.title.create({
    data: {
      title: `${MARK} ${title}`,
      searchTitle: `${MARK} ${title}`.toLowerCase(),
      platform: "Netflix",
      mediaType: "Movie",
      status: "Watched",
      lastWatchedAt: new Date("2024-01-02T00:00:00.000Z"),
      ...data,
    },
  });
  ids.push(created.id);
  return created;
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("@/app/api/titles/route"));
  ({ GET, PATCH, DELETE } = await import("@/app/api/titles/[id]/route"));
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
  await prisma.$disconnect();
});

test("without a session nothing is added", async () => {
  authenticated = false;
  const res = await post({ candidate: candidate("unauthorised"), platform: "Netflix" });
  authenticated = true;
  assert.equal(res.status, 401);
  assert.equal(await row("unauthorised"), null);
});

test("a title is added where and when it says", async () => {
  const res = await post({
    candidate: candidate("added"),
    platform: "Netflix",
    lastWatchedAt: "2024-03-02T00:00:00.000Z",
  });
  assert.equal(res.status, 200);
  const created = await row("added");
  assert.equal(created?.platform, "Netflix");
  assert.equal(created?.status, "Watched");
  assert.equal(created?.inWatchlist, false);
  assert.equal(created?.lastWatchedAt?.toISOString(), "2024-03-02T00:00:00.000Z");
});

test("a platform that is not one of ours is refused, and nothing is written", async () => {
  const res = await post({ candidate: candidate("bad platform"), platform: "Blockbuster" });
  assert.equal(res.status, 400);
  assert.equal(await row("bad platform"), null);
});

test("a date that is not a date is refused, on the way in and on a correction", async () => {
  // "some time in 2021" is not rejected by the constructor: V8 reads it as
  // the first of January 2021. Stored, it would look like a fact ever after.
  const vague = await post({
    candidate: candidate("vague date", { tmdbId: 5550003 }),
    platform: "Netflix",
    lastWatchedAt: "some time in 2021",
  });
  assert.equal(vague.status, 400);
  assert.equal(await row("vague date"), null);

  const seeded = await seed("keeps its date");
  const corrected = await patch(seeded.id, {
    editWatched: { platform: "Netflix", lastWatchedAt: "the other week" },
  });
  assert.equal(corrected.status, 400);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.lastWatchedAt?.toISOString(), "2024-01-02T00:00:00.000Z");
});

test("a day that does not exist is refused too", async () => {
  const seeded = await seed("impossible day");
  const res = await patch(seeded.id, {
    markWatched: { platform: "Netflix", lastWatchedAt: "2024-02-31" },
  });
  assert.equal(res.status, 400);
});

test("the same title twice does not become two rows", async () => {
  await post({ candidate: candidate("added"), platform: "Netflix" });
  assert.equal(await prisma.title.count({ where: { title: `${MARK} added` } }), 1);
});

test("a watchlist entry is stored as unwatched, with no platform", async () => {
  const res = await post({ candidate: candidate("planned", { tmdbId: 5550002 }), watchlist: true });
  assert.equal(res.status, 200);
  const created = await row("planned");
  assert.equal(created?.inWatchlist, true);
  assert.equal(created?.status, "To watch");
  assert.equal(created?.platform, "");
  assert.equal(created?.lastWatchedAt, null);
});

test("marking a watchlist entry watched moves it and records where", async () => {
  const seeded = await seed("to mark", { inWatchlist: true, status: "To watch", platform: "", lastWatchedAt: null });
  const res = await patch(seeded.id, {
    markWatched: { platform: "Disney+", lastWatchedAt: "2025-05-04T00:00:00.000Z" },
  });
  assert.equal(res.status, 200);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.inWatchlist, false);
  assert.equal(after.status, "Watched");
  assert.equal(after.platform, "Disney+");
  assert.equal(after.lastWatchedAt?.toISOString(), "2025-05-04T00:00:00.000Z");
});

test("marking it watched somewhere invented changes nothing", async () => {
  const seeded = await seed("bad mark", { inWatchlist: true, status: "To watch", platform: "", lastWatchedAt: null });
  const res = await patch(seeded.id, { markWatched: { platform: "Blockbuster" } });
  assert.equal(res.status, 400);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.inWatchlist, true);
  assert.equal(after.platform, "");
});

test("moving back to the watchlist drops the platform and the date", async () => {
  const seeded = await seed("to unwatch");
  const res = await patch(seeded.id, { moveToWatchlist: true });
  assert.equal(res.status, 200);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.inWatchlist, true);
  assert.equal(after.status, "To watch");
  assert.equal(after.platform, "");
  assert.equal(after.lastWatchedAt, null);
});

test("correcting a title that was never watched is refused", async () => {
  const seeded = await seed("still planned", { inWatchlist: true, status: "To watch", platform: "", lastWatchedAt: null });
  const res = await patch(seeded.id, { editWatched: { platform: "Netflix" } });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /watchlist/i);
});

test("a correction cannot claim more seasons than the series has", async () => {
  const seeded = await seed("series", { mediaType: "Series", totalSeasons: 3, watchedSeasons: 1 });
  const res = await patch(seeded.id, {
    editWatched: { platform: "Netflix", lastWatchedAt: "2024-06-01T00:00:00.000Z", watchedSeasons: 9 },
  });
  assert.equal(res.status, 200);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.watchedSeasons, 3);
});

test("a correction that does not mention seasons leaves them alone", async () => {
  const seeded = await seed("series kept", { mediaType: "Series", totalSeasons: 4, watchedSeasons: 2 });
  await patch(seeded.id, { editWatched: { platform: "Max", lastWatchedAt: null } });
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.watchedSeasons, 2);
  assert.equal(after.platform, "Max");
  assert.equal(after.lastWatchedAt, null);
});

test("seasons cannot be recorded against a movie", async () => {
  const seeded = await seed("a movie");
  const res = await patch(seeded.id, { watchedSeasons: 2 });
  assert.equal(res.status, 400);
});

test("seasons cannot be recorded against something not watched yet", async () => {
  const seeded = await seed("planned series", {
    mediaType: "Series",
    inWatchlist: true,
    status: "To watch",
    platform: "",
    lastWatchedAt: null,
    totalSeasons: 2,
  });
  const res = await patch(seeded.id, { watchedSeasons: 1 });
  assert.equal(res.status, 400);
});

test("a negative season count clears the progress rather than storing a negative", async () => {
  // None watched is null in this schema, not zero — see clampWatchedSeasons.
  const seeded = await seed("negative", { mediaType: "Series", totalSeasons: 5, watchedSeasons: 3 });
  const res = await patch(seeded.id, { watchedSeasons: -4 });
  assert.equal(res.status, 200);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.watchedSeasons, null);
});

test("dismissing the new-season badge clears the flag", async () => {
  const seeded = await seed("new season", {
    mediaType: "Series",
    totalSeasons: 2,
    watchedSeasons: 2,
    newSeasonAvailable: true,
  });
  const res = await patch(seeded.id, { dismissNewSeason: true });
  assert.equal(res.status, 200);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: seeded.id } });
  assert.equal(after.newSeasonAvailable, false);
});

test("editing a title that is not there is a 404, not a crash", async () => {
  const res = await patch(999_999_999, { markWatched: { platform: "Netflix" } });
  assert.equal(res.status, 404);
});

test("deleting removes the row, and deleting it again is a 404", async () => {
  const seeded = await seed("to delete");
  const url = `http://localhost/api/titles/${seeded.id}`;
  const params = { params: Promise.resolve({ id: String(seeded.id) }) };
  const first = await DELETE(new NextRequest(url, { method: "DELETE" }), params);
  assert.equal(first.status, 200);
  assert.equal(await prisma.title.findUnique({ where: { id: seeded.id } }), null);
  const second = await DELETE(new NextRequest(url, { method: "DELETE" }), params);
  assert.equal(second.status, 404);
});

/* The columns the catalog payload leaves behind, which the details modal and
   the "mark as watched" dialog fetch one title at a time. Worth pinning down:
   the point of the endpoint is that these are exactly the fields the grid
   does not carry, so dropping one here would leave the modal with a blank it
   has no other way to fill. */

test("one title's off-catalog columns come back", async () => {
  const seeded = await seed("details", {
    overview: "A synopsis long enough to be worth leaving out of the catalog.",
    personalRating: 8.5,
    link: "https://example.com/a-title",
  });
  const res = await get(seeded.id);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    overview: "A synopsis long enough to be worth leaving out of the catalog.",
    personalRating: 8.5,
    link: "https://example.com/a-title",
  });
});

test("a title with none of them set comes back with nulls, not an error", async () => {
  const seeded = await seed("details empty");
  const res = await get(seeded.id);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { overview: null, personalRating: null, link: null });
});

test("asking for a title that is not there is a 404", async () => {
  const res = await get(999_999_999);
  assert.equal(res.status, 404);
});

test("asking with something that is not an id is a 400", async () => {
  const res = await get("not-a-number");
  assert.equal(res.status, 400);
});

test("without a session no title's columns come back", async () => {
  const seeded = await seed("details unauthorised", { overview: "secret" });
  authenticated = false;
  const res = await get(seeded.id);
  authenticated = true;
  assert.equal(res.status, 401);
});
