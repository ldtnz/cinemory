/**
 * The import route, driven as a route.
 *
 * The parsers under src/lib/history.ts were well covered and the route that
 * uses them was not, which left the part that decides what is written —
 * de-duplication against the catalog, seasons brought forward, and what
 * happens to a file it cannot read — untested. That is the half where a
 * mistake costs rows rather than a wrong number on a screen.
 *
 * Same arrangement as tests/api-titles.test.ts: real handler, real database,
 * only the session check mocked.
 */
import { test, before, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

let authenticated = true;
mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let POST: typeof import("@/app/api/import/route").POST;

const MARK = "zzimport";

type Outcome = {
  file: string;
  format: string | null;
  read: number;
  alreadyPresent: number;
  added: number;
  seasonsUpdated: number;
  error?: string;
};

/** A Netflix export: two columns, one row per episode watched. */
function netflix(rows: [string, string][]) {
  return ["Title,Date", ...rows.map(([t, d]) => `"${MARK} ${t}","${d}"`)].join("\n");
}

async function importFiles(...files: { name: string; content: string }[]) {
  const form = new FormData();
  for (const f of files) form.append("file", new File([f.content], f.name, { type: "text/csv" }));
  const res = await POST(
    new NextRequest("http://localhost/api/import", { method: "POST", body: form }),
  );
  return { status: res.status, body: (await res.json()) as { outcomes: Outcome[]; added: number } };
}

const rows = () =>
  prisma.title.findMany({
    where: { title: { startsWith: MARK } },
    orderBy: { title: "asc" },
    select: { title: true, mediaType: true, watchedSeasons: true, lastWatchedAt: true, platform: true },
  });

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("@/app/api/import/route"));
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
  await prisma.$disconnect();
});

test("without a session nothing is imported", async () => {
  authenticated = false;
  const { status } = await importFiles({
    name: "history.csv",
    content: netflix([["Unauthorised", "6/14/25"]]),
  });
  authenticated = true;
  assert.equal(status, 401);
  assert.equal((await rows()).length, 0);
});

test("a history is read and added, with where it came from", async () => {
  const { body } = await importFiles({
    name: "NetflixViewingHistory.csv",
    content: netflix([
      ["A Film", "6/14/25"],
      ["A Show: Season 1: First", "6/13/25"],
      ["A Show: Season 2: Later", "6/12/25"],
    ]),
  });
  assert.equal(body.outcomes[0].format, "netflix");
  assert.equal(body.added, 2, "the two episodes of one show are one title");
  const stored = await rows();
  assert.deepEqual(
    stored.map((r) => r.title.replace(`${MARK} `, "")),
    ["A Film", "A Show"],
  );
  assert.equal(stored[1].mediaType, "Series");
  assert.equal(stored[1].watchedSeasons, 2);
  assert.equal(stored[0].platform, "Netflix");
});

test("importing the same export again adds nothing", async () => {
  const { body } = await importFiles({
    name: "NetflixViewingHistory.csv",
    content: netflix([
      ["A Film", "6/14/25"],
      ["A Show: Season 1: First", "6/13/25"],
    ]),
  });
  assert.equal(body.added, 0);
  assert.equal(body.outcomes[0].alreadyPresent, 2);
  assert.equal((await rows()).length, 2);
});

test("a fresh export brings a series' progress forward", async () => {
  // The count is how many distinct seasons the file carries, so it is a full
  // export — the kind these services hand out — that moves it on.
  const { body } = await importFiles({
    name: "NetflixViewingHistory.csv",
    content: netflix([
      ["A Show: Season 1: First", "6/13/25"],
      ["A Show: Season 2: Later", "6/12/25"],
      ["A Show: Season 3: Newest", "7/01/25"],
    ]),
  });
  assert.equal(body.added, 0);
  assert.equal(body.outcomes[0].seasonsUpdated, 1);
  const show = (await rows()).find((r) => r.title.endsWith("A Show"));
  assert.equal(show?.watchedSeasons, 3);
});

test("a partial export does not walk that progress back", async () => {
  // One season in the file means one, which is fewer than the three already
  // recorded; the import only ever raises the count.
  await importFiles({
    name: "NetflixViewingHistory.csv",
    content: netflix([["A Show: Season 3: Newest", "7/01/25"]]),
  });
  const show = (await rows()).find((r) => r.title.endsWith("A Show"));
  assert.equal(show?.watchedSeasons, 3);
});

test("a file in no format we know is reported, and nothing is written", async () => {
  const before = (await rows()).length;
  const { body } = await importFiles({
    name: "something-else.csv",
    content: "Column A,Column B\n1,2",
  });
  assert.equal(body.added, 0);
  assert.match(body.outcomes[0].error ?? "", /format/i);
  assert.equal((await rows()).length, before);
});

test("two files uploaded together do not duplicate each other", async () => {
  const content = netflix([["Shared Title", "6/14/25"]]);
  const { body } = await importFiles(
    { name: "one.csv", content },
    { name: "two.csv", content },
  );
  assert.equal(body.added, 1);
  assert.equal(
    await prisma.title.count({ where: { title: `${MARK} Shared Title` } }),
    1,
  );
});

test("a Letterboxd watchlist is told from a watched file by its name", async () => {
  // The two have the same header, so this is the one format where the file
  // name decides which half of the catalog a title lands in.
  const header = "Date,Name,Year,Letterboxd URI";
  const watchlist = [header, `2025-04-02,${MARK} Zone of Interest,2023,https://boxd.it/a`].join("\n");
  const watched = [header, `2025-04-02,${MARK} Sorcerer,1977,https://boxd.it/b`].join("\n");

  const first = await importFiles({ name: "watchlist.csv", content: watchlist });
  assert.equal(first.body.outcomes[0].format, "letterboxd-watchlist");
  const second = await importFiles({ name: "watched.csv", content: watched });
  assert.equal(second.body.outcomes[0].format, "letterboxd");

  const stored = await prisma.title.findMany({
    where: { title: { startsWith: MARK } },
    select: { title: true, inWatchlist: true, status: true, platform: true, year: true },
  });
  const planned = stored.find((t) => t.title.endsWith("Zone of Interest"));
  const seen = stored.find((t) => t.title.endsWith("Sorcerer"));
  assert.equal(planned?.inWatchlist, true);
  assert.equal(planned?.platform, "");
  assert.equal(seen?.inWatchlist, false);
  assert.equal(seen?.platform, "Unknown");
  assert.equal(seen?.year, 1977);
});

test("a Letterboxd diary brings the ratings across", async () => {
  const { body } = await importFiles({
    name: "diary.csv",
    content: [
      "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
      `2025-03-14,${MARK} Perfect Days,2023,https://boxd.it/c,4.5,No,,2025-03-12`,
    ].join("\n"),
  });
  assert.equal(body.added, 1);
  const row = await prisma.title.findFirstOrThrow({
    where: { title: `${MARK} Perfect Days` },
  });
  assert.equal(row.personalRating, 9, "four and a half stars out of five, nine out of ten");
  assert.equal(row.lastWatchedAt?.getDate(), 12);
});

test("a file too large to be a history is refused by size, not parsed", async () => {
  const huge = netflix([["Big", "6/14/25"]]) + "\n" + '"x","6/14/25"'.repeat(700_000);
  const { body } = await importFiles({ name: "huge.csv", content: huge });
  assert.match(body.outcomes[0].error ?? "", /too large/i);
  assert.equal(body.added, 0);
});
