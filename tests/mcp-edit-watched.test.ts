/**
 * Correcting a watched title through the connector.
 *
 * Reading the wrong row gives a wrong answer; writing to the wrong row loses
 * data, so most of what is checked here is which row a name resolves to — and
 * that an ambiguous name resolves to none of them and says so, rather than
 * picking one. The rest is refusing input the app itself would not accept: a
 * platform that is not on the list, a date that is not a date.
 *
 * Runs against the local dev database and cleans up after itself.
 */
import { test, before, after as afterAll } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let editWatched: typeof import("@/lib/mcp-catalog").editWatched;
let parseWatchedDate: typeof import("@/lib/mcp-catalog").parseWatchedDate;

/** Far outside anything a real import would produce. */
const MARK = "zzqq";
const ids: number[] = [];

async function add(title: string, opts: { watched?: boolean; platform?: string } = {}) {
  const { normalizeTitle } = await import("@/lib/title-key");
  const row = await prisma.title.create({
    data: {
      title,
      searchTitle: normalizeTitle(title),
      platform: opts.watched === false ? "" : (opts.platform ?? "Netflix"),
      mediaType: "Movie",
      status: opts.watched === false ? "To watch" : "Watched",
      inWatchlist: opts.watched === false,
      lastWatchedAt: opts.watched === false ? null : new Date(2020, 0, 2),
    },
  });
  ids.push(row.id);
  return row;
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ editWatched, parseWatchedDate } = await import("@/lib/mcp-catalog"));
  await add(`${MARK} Dune`);
  await add(`${MARK} Dune Part One`);
  await add(`${MARK} Dune Part Two`);
  await add(`${MARK} Solaris`);
  await add(`${MARK} Stalker`, { watched: false });
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test("the platform and the date are changed together", async () => {
  const out = await editWatched(`${MARK} Solaris`, "Cinema", "2023-07-14");
  assert.equal(out.changed, true);
  assert.equal(out.platform, "Cinema");
  assert.equal(out.watchedOn, "2023-07-14");
});

test("only the field given is touched", async () => {
  // The other half must survive, or correcting a platform would quietly wipe
  // the date it was watched on.
  await editWatched(`${MARK} Solaris`, "Netflix");
  const row = await prisma.title.findFirst({ where: { title: `${MARK} Solaris` } });
  assert.equal(row!.platform, "Netflix");
  assert.equal(row!.lastWatchedAt?.toISOString().slice(0, 10), "2023-07-14");
});

test("an exact name wins over the longer ones that contain it", async () => {
  // "Dune" is inside both "Dune Part One" and "Dune Part Two", so without the
  // exact match first this would be ambiguous — and the film actually named
  // Dune would be unreachable.
  const out = await editWatched(`${MARK} Dune`, "Max");
  assert.equal(out.changed, true);
  assert.equal(out.title, `${MARK} Dune`);
  const others = await prisma.title.findMany({
    where: { title: { in: [`${MARK} Dune Part One`, `${MARK} Dune Part Two`] } },
  });
  assert.deepEqual(
    others.map((t) => t.platform),
    ["Netflix", "Netflix"],
    "another row was written to",
  );
});

test("an ambiguous name changes nothing and names the candidates", async () => {
  const out = await editWatched(`${MARK} Dune Part`, "Hulu");
  assert.equal(out.changed, false);
  assert.match(out.reason ?? "", /Dune Part One/);
  assert.match(out.reason ?? "", /Dune Part Two/);
  const rows = await prisma.title.findMany({ where: { id: { in: ids } } });
  assert.equal(rows.filter((r) => r.platform === "Hulu").length, 0);
});

test("a title on the to-watch list is refused, and told apart from a typo", async () => {
  const waiting = await editWatched(`${MARK} Stalker`, "Netflix");
  assert.equal(waiting.changed, false);
  assert.match(waiting.reason ?? "", /to-watch list/);

  const missing = await editWatched(`${MARK} Andrei Rublev`, "Netflix");
  assert.equal(missing.changed, false);
  assert.match(missing.reason ?? "", /Not in the catalog/);
});

test("a platform that is not on the list is refused, with the list", async () => {
  const out = await editWatched(`${MARK} Solaris`, "netflix");
  assert.equal(out.changed, false);
  assert.match(out.reason ?? "", /Netflix/, "the answer has to say what is accepted");
  const row = await prisma.title.findFirst({ where: { title: `${MARK} Solaris` } });
  assert.equal(row!.platform, "Netflix", "the stored value is the canonical spelling, untouched");
});

test("a date the engine would happily invent is refused", async () => {
  // new Date("some time in 2021") is the 1st of January 2021 in V8, so the
  // hedge would be stored as a fact and nothing would look wrong later. This
  // is the case worth having a test for; "last summer" merely fails.
  for (const junk of ["some time in 2021", "last summer", "14/07/2023", "2023-13-01", "2024-02-31", ""]) {
    assert.equal(parseWatchedDate(junk), null, `accepted ${junk}`);
  }
  assert.equal(parseWatchedDate("2023-07-14")?.getDate(), 14);
  // A full timestamp is still a date, and a leap day is a real one.
  assert.equal(parseWatchedDate("2024-02-29")?.getMonth(), 1);
  assert.ok(parseWatchedDate("2023-07-14T21:30:00Z"));

  const out = await editWatched(`${MARK} Solaris`, undefined, "some time in 2021");
  assert.equal(out.changed, false);
  assert.match(out.reason ?? "", /not a date/);
  const row = await prisma.title.findFirst({ where: { title: `${MARK} Solaris` } });
  assert.equal(row!.lastWatchedAt?.toISOString().slice(0, 10), "2023-07-14");
});

test("a call with nothing to change is refused rather than counted as done", async () => {
  const out = await editWatched(`${MARK} Solaris`);
  assert.equal(out.changed, false);
  assert.match(out.reason ?? "", /Nothing to change/);
});
