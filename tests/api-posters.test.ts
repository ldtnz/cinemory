/**
 * The two routes behind "Missing posters".
 *
 * They are the only place in the app where artwork and metadata are attached
 * to a title by hand, and the "ignore" one writes the sentinel that decides
 * whether a title ever appears on that list again — the value whose filter
 * was wrong for months (tests/missing-posters.test.ts). Worth pinning both
 * ends: the write, and the row disappearing from the list afterwards.
 */
import { test, before, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

let authenticated = true;
mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let match: typeof import("@/app/api/posters/match/route").POST;
let ignore: typeof import("@/app/api/posters/ignore/route").POST;
let MISSING_POSTER: import("@prisma/client").Prisma.TitleWhereInput;
let POSTER_IGNORED: number;

const MARK = "zzposterroute";

function request(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seed(title: string) {
  return prisma.title.create({
    data: {
      title: `${MARK} ${title}`,
      searchTitle: `${MARK} ${title}`.toLowerCase(),
      platform: "Netflix",
      mediaType: "Movie",
      status: "Watched",
    },
  });
}

/** Is it still on the list the settings page offers to fix? */
async function onTheList(id: number) {
  return (await prisma.title.count({ where: { AND: [MISSING_POSTER, { id }] } })) === 1;
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: match } = await import("@/app/api/posters/match/route"));
  ({ POST: ignore } = await import("@/app/api/posters/ignore/route"));
  ({ MISSING_POSTER, POSTER_IGNORED } = await import("@/lib/posters"));
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
  await prisma.$disconnect();
});

test("choosing a match fills the title in and takes it off the list", async () => {
  const row = await seed("unmatched");
  assert.ok(await onTheList(row.id), "it should start out on the list");

  const res = await match(
    request("http://localhost/api/posters/match", {
      id: row.id,
      candidate: {
        tmdbId: 603,
        title: "The Matrix",
        mediaType: "Movie",
        posterUrl: "https://image.tmdb.org/t/p/w500/matrix.jpg",
        backdropUrl: null,
        overview: "A hacker learns the truth.",
        tmdbRating: 8.2,
        year: 1999,
        genres: "Action, Science Fiction",
      },
    }),
  );
  assert.equal(res.status, 200);

  const after = await prisma.title.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after.tmdbId, 603);
  assert.equal(after.posterUrl, "https://image.tmdb.org/t/p/w500/matrix.jpg");
  assert.equal(after.year, 1999);
  assert.equal(after.genres, "Action, Science Fiction");
  // The title itself is not overwritten: the row is the reader's, the match
  // only brings the artwork and the details.
  assert.equal(after.title, `${MARK} unmatched`);
  assert.equal(await onTheList(row.id), false);
});

test("ignoring one takes it off the list without pretending it was matched", async () => {
  const row = await seed("give up on this");
  const res = await ignore(request("http://localhost/api/posters/ignore", { id: row.id }));
  assert.equal(res.status, 200);

  const after = await prisma.title.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after.tmdbId, POSTER_IGNORED);
  assert.equal(after.posterUrl, null);
  assert.equal(await onTheList(row.id), false);
});

test("without a session neither of them writes", async () => {
  const row = await seed("unauthorised");
  authenticated = false;
  const one = await ignore(request("http://localhost/api/posters/ignore", { id: row.id }));
  const two = await match(
    request("http://localhost/api/posters/match", { id: row.id, candidate: { tmdbId: 1 } }),
  );
  authenticated = true;
  assert.equal(one.status, 401);
  assert.equal(two.status, 401);
  const after = await prisma.title.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(after.tmdbId, null);
});

test("a body without an id is refused", async () => {
  const res = await ignore(request("http://localhost/api/posters/ignore", { nope: true }));
  assert.equal(res.status, 400);
});
