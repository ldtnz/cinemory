/**
 * Which titles the settings page offers to fix by hand.
 *
 * The list exists for exactly one population: titles an import brought in that
 * TMDB never matched, so they sit in the grid with no artwork and no details.
 * Those rows have a null tmdbId — and the filter that skips the "ignored"
 * ones used to be written as NOT (tmdbId = -1), which in SQL is null rather
 * than true for a null tmdbId, so every one of them was silently dropped. The
 * page then showed nothing to fix, which is the one thing it must never do
 * while there is something to fix.
 *
 * Runs against the local dev database and cleans up after itself.
 */
import { test, before, after as afterAll } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let MISSING_POSTER: import("@prisma/client").Prisma.TitleWhereInput;
let POSTER_IGNORED: number;

const MARK = "zzposter";
const ids: number[] = [];

async function add(title: string, tmdbId: number | null, posterUrl: string | null) {
  const row = await prisma.title.create({
    data: {
      title: `${MARK} ${title}`,
      searchTitle: `${MARK} ${title}`.toLowerCase(),
      platform: "Amazon Prime Video",
      mediaType: "Movie",
      status: "Watched",
      inWatchlist: false,
      tmdbId,
      posterUrl,
    },
  });
  ids.push(row.id);
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ MISSING_POSTER, POSTER_IGNORED } = await import("@/lib/posters"));

  await add("never matched", null, null);
  await add("ignored on purpose", POSTER_IGNORED, null);
  await add("matched but artless", 1234567, null);
  await add("perfectly fine", 7654321, "https://image.tmdb.org/t/p/w500/x.jpg");
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function listed() {
  const rows = await prisma.title.findMany({
    where: { AND: [MISSING_POSTER, { title: { startsWith: MARK } }] },
    select: { title: true },
    orderBy: { title: "asc" },
  });
  return rows.map((r) => r.title.replace(`${MARK} `, ""));
}

test("a title TMDB never matched is on the list", async () => {
  // The regression: a null tmdbId must not be swept up by the rule that
  // skips the ignored ones.
  assert.ok((await listed()).includes("never matched"));
});

test("a title deliberately ignored is not", async () => {
  assert.ok(!(await listed()).includes("ignored on purpose"));
});

test("a matched title that still has no artwork is on the list", async () => {
  assert.ok((await listed()).includes("matched but artless"));
});

test("a title with artwork is not", async () => {
  assert.ok(!(await listed()).includes("perfectly fine"));
});

test("altogether: the two that need a hand, and only those", async () => {
  assert.deepEqual(await listed(), ["matched but artless", "never matched"]);
});
