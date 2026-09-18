/**
 * The batch that fetches posters and details from TMDB.
 *
 * It is the one route that can stop halfway through legitimately — the client
 * drives it in batches, and a closed tab or a slow TMDB leaves the rest of the
 * catalog without details. What matters is that it can be picked up again
 * from where it stopped, and that a title TMDB cannot match is left alone
 * rather than retried forever.
 *
 * TMDB is mocked here: the point is the route's bookkeeping, not the network.
 */
import { test, before, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

let authenticated = true;
let tmdbConfigured = true;
/** Titles TMDB is pretending to know, by the name it is asked about. */
const known = new Map<string, { tmdbId: number; posterUrl: string }>();

mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });
mock.module("@/lib/tmdb", {
  namedExports: {
    isTmdbConfigured: () => tmdbConfigured,
    findBestTmdbMatch: async (title: string) => {
      const hit = known.get(title);
      return hit
        ? {
            tmdbId: hit.tmdbId,
            title,
            mediaType: "Movie",
            posterUrl: hit.posterUrl,
            backdropUrl: null,
            overview: "Something happens.",
            tmdbRating: 7,
            year: 2010,
            genres: "Drama",
          }
        : null;
    },
  },
});

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let POST: typeof import("@/app/api/import/enrich/route").POST;

const MARK = "zzenrich";

async function seed(name: string, matched: boolean) {
  const title = `${MARK} ${name}`;
  if (matched) known.set(title, { tmdbId: 700000 + known.size, posterUrl: `https://image.tmdb.org/t/p/w500/${known.size}.jpg` });
  return prisma.title.create({
    data: {
      title,
      searchTitle: title.toLowerCase(),
      platform: "Netflix",
      mediaType: "Movie",
      status: "Watched",
    },
  });
}

async function enrich(cursor: number) {
  const res = await POST(
    new NextRequest("http://localhost/api/import/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cursor }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("@/app/api/import/enrich/route"));
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
  await prisma.$disconnect();
});

test("without a session nothing is fetched", async () => {
  authenticated = false;
  const { status } = await enrich(0);
  authenticated = true;
  assert.equal(status, 401);
});

test("with no TMDB key it says so rather than silently doing nothing", async () => {
  tmdbConfigured = false;
  const { status, body } = await enrich(0);
  tmdbConfigured = true;
  assert.equal(status, 503);
  assert.match(body.error, /TMDB/);
});

test("a title with no details gets them, and one TMDB cannot place is left alone", async () => {
  const first = await seed("known film", true);
  await seed("film nobody knows", false);

  const { body } = await enrich(first.id - 1);
  assert.equal(body.enriched, 1);
  assert.equal(body.unmatched, 1);

  const matched = await prisma.title.findUniqueOrThrow({ where: { id: first.id } });
  assert.ok(matched.tmdbId);
  assert.ok(matched.posterUrl);
  assert.equal(matched.year, 2010);

  const unmatched = await prisma.title.findFirstOrThrow({
    where: { title: `${MARK} film nobody knows` },
  });
  assert.equal(unmatched.tmdbId, null, "left for the missing-posters list to handle by hand");
});

test("a sweep from zero reaches a title an earlier run never got to", async () => {
  // What an interrupted import leaves behind: rows with no details at all,
  // anywhere in the catalog rather than only at the end of it. The client
  // keeps calling with the cursor it was handed until "done" — this is that
  // loop, and the title it has to reach sits behind everything already there.
  const stranded = await seed("stranded by a closed tab", true);

  let cursor = 0;
  let rounds = 0;
  for (; rounds < 500; rounds++) {
    const { body } = await enrich(cursor);
    cursor = body.cursor;
    if (body.done || body.remaining === 0) break;
  }
  assert.ok(rounds < 500, "the loop has to terminate");

  const after = await prisma.title.findUniqueOrThrow({ where: { id: stranded.id } });
  assert.ok(after.tmdbId, "the stranded title now has its details");
  assert.ok(after.posterUrl);
});

test("the cursor moves forward and the count left says when to stop", async () => {
  const { body } = await enrich(0);
  assert.ok(body.cursor >= 0);
  assert.equal(typeof body.remaining, "number");
  assert.equal(typeof body.done, "boolean");
});
