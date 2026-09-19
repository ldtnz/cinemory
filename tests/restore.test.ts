/**
 * Reading a backup back into the catalog.
 *
 * The export has always written a full JSON dump, and until now nothing could
 * read it: the settings page offered a file that was, in practice, a one-way
 * door. What matters here is that a restore adds what is missing without
 * touching what is there, and that a damaged file costs the rows it damaged
 * rather than the whole restore.
 *
 * The parsing half runs on no database at all; the insert half runs against
 * the local dev database and cleans up after itself.
 */
import { test, before, after as afterAll } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let parseBackup: typeof import("@/lib/restore").parseBackup;
let restoreTitles: typeof import("@/lib/restore").restoreTitles;

const MARK = "zzrestore";
const ids: number[] = [];

/** A row shaped the way /api/export writes one. */
function exported(title: string, extra: Record<string, unknown> = {}) {
  return {
    id: 999,
    title: `${MARK} ${title}`,
    searchTitle: `${MARK} ${title}`.toLowerCase(),
    platform: "Netflix",
    mediaType: "Movie",
    status: "Watched",
    lastWatchedAt: "2024-03-02T00:00:00.000Z",
    totalSeasons: null,
    watchedSeasons: null,
    newSeasonAvailable: false,
    inWatchlist: false,
    link: null,
    tmdbId: 111,
    posterUrl: "https://image.tmdb.org/t/p/w500/x.jpg",
    backdropUrl: null,
    overview: "Something happens.",
    tmdbRating: 7.5,
    year: 2011,
    genres: "Drama",
    personalRating: 9,
    createdAt: "2020-01-05T00:00:00.000Z",
    updatedAt: "2024-03-02T00:00:00.000Z",
    ...extra,
  };
}

function backup(titles: unknown[]) {
  return { version: 1, exportedAt: "2025-01-01T00:00:00.000Z", titles };
}

async function restore(payload: unknown) {
  const parsed = parseBackup(payload);
  assert.ok(parsed.ok, "expected the backup to parse");
  const report = await restoreTitles(parsed.rows, parsed.read, parsed.unreadable);
  const added = await prisma.title.findMany({
    where: { title: { startsWith: MARK } },
    select: { id: true },
  });
  for (const row of added) if (!ids.includes(row.id)) ids.push(row.id);
  return report;
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ parseBackup, restoreTitles } = await import("@/lib/restore"));
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("a file that is not a backup is refused with a reason", () => {
  assert.equal(parseBackup(null).ok, false);
  assert.equal(parseBackup({ titles: [] }).ok, false);
  const wrongVersion = parseBackup({ version: 99, titles: [] });
  assert.equal(wrongVersion.ok, false);
  assert.match(wrongVersion.ok === false ? wrongVersion.error : "", /version/i);
});

test("a row with no title at all is counted, not fatal", () => {
  const parsed = parseBackup(backup([exported("good"), { platform: "Netflix" }, "not an object"]));
  assert.ok(parsed.ok);
  assert.equal(parsed.read, 3);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.unreadable, 2);
});

test("an empty platform is real data, not a broken row", () => {
  // Watchlist entries are stored with "", and so are older watched titles
  // whose service was never recorded. Rejecting them would quietly drop real
  // titles from a restore — four of them in the catalog this was written
  // against.
  const parsed = parseBackup(backup([exported("no service", { platform: "" })]));
  assert.ok(parsed.ok);
  assert.equal(parsed.unreadable, 0);
  assert.equal(parsed.rows[0].platform, "");
});

test("a row with no status lands in the half its watchlist flag implies", () => {
  const parsed = parseBackup(
    backup([
      exported("planned", { status: undefined, inWatchlist: true }),
      exported("seen", { status: undefined, inWatchlist: false }),
    ]),
  );
  assert.ok(parsed.ok);
  assert.equal(parsed.rows[0].status, "To watch");
  assert.equal(parsed.rows[1].status, "Watched");
});

test("an unparseable date is dropped rather than guessed at", () => {
  const parsed = parseBackup(backup([exported("odd date", { lastWatchedAt: "some time in 2021" })]));
  assert.ok(parsed.ok);
  assert.equal(parsed.rows[0].lastWatchedAt, null);
});

test("every column the catalog shows survives the round trip", async () => {
  const report = await restore(backup([exported("round trip")]));
  assert.equal(report.added, 1);

  const row = await prisma.title.findFirst({ where: { title: `${MARK} round trip` } });
  assert.ok(row);
  assert.equal(row.platform, "Netflix");
  assert.equal(row.status, "Watched");
  assert.equal(row.lastWatchedAt?.toISOString(), "2024-03-02T00:00:00.000Z");
  assert.equal(row.tmdbId, 111);
  assert.equal(row.posterUrl, "https://image.tmdb.org/t/p/w500/x.jpg");
  assert.equal(row.tmdbRating, 7.5);
  assert.equal(row.year, 2011);
  assert.equal(row.genres, "Drama");
  assert.equal(row.personalRating, 9);
  assert.equal(row.overview, "Something happens.");
  // When the title entered the catalog is part of the backup, not of the
  // moment it was read back.
  assert.equal(row.createdAt.toISOString(), "2020-01-05T00:00:00.000Z");
});

test("restoring the same file twice adds nothing the second time", async () => {
  const again = await restore(backup([exported("round trip")]));
  assert.equal(again.added, 0);
  assert.equal(again.alreadyPresent, 1);
  const rows = await prisma.title.count({ where: { title: `${MARK} round trip` } });
  assert.equal(rows, 1);
});

test("a title already in the catalog is left exactly as it was", async () => {
  await prisma.title.update({
    where: { id: (await prisma.title.findFirstOrThrow({ where: { title: `${MARK} round trip` } })).id },
    data: { status: "To watch", platform: "Cinema", personalRating: 3 },
  });
  await restore(backup([exported("round trip")]));
  const row = await prisma.title.findFirstOrThrow({ where: { title: `${MARK} round trip` } });
  assert.equal(row.status, "To watch");
  assert.equal(row.platform, "Cinema");
  assert.equal(row.personalRating, 3);
});

test("the same title twice inside one file still yields one row", async () => {
  // This fixture is a different work from the earlier round-trip title (TMDB 111).
  const report = await restore(backup([exported("doubled", { tmdbId: 112 }), exported("doubled", { tmdbId: 112 })]));
  assert.equal(report.added, 1);
  assert.equal(report.alreadyPresent, 1);
  assert.equal(await prisma.title.count({ where: { title: `${MARK} doubled` } }), 1);
});

test("a series is matched the way the CSV import matches one", async () => {
  // seriesKey strips the season from the title, so a backup written as
  // "Dark: Season 2" must not come back alongside an existing "Dark".
  await restore(backup([exported("dark", { mediaType: "Series", watchedSeasons: 1 })]));
  const report = await restore(
    backup([exported("dark: Season 2", { mediaType: "Series", watchedSeasons: 2 })]),
  );
  assert.equal(report.added, 0);
  assert.equal(report.alreadyPresent, 1);
});
