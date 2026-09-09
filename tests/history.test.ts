/**
 * The watch-history parsers.
 *
 * These are the most delicate functions in the project: they turn two
 * inconsistent CSV exports into catalog rows, guessing what is a series, which
 * rows belong together and how many seasons were watched. A mistake here does
 * not throw — it silently splits one show into eleven rows, or merges two
 * different films. Hence the tests.
 *
 * Run with `npm test`. No test framework: node:test ships with Node, and tsx
 * (already a dev dependency) resolves the TypeScript and the "@/" alias.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFormat,
  readAmazon,
  readNetflix,
  seasonNumber,
  seriesKey,
  withoutSeason,
} from "@/lib/history";
import type { HistoryRow } from "@/lib/history";

/** Builds a CSV the way the exports do, quoting every field. */
function csv(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function netflixCsv(rows: [title: string, date: string][]): string {
  return csv(["Title", "Date"], rows.map(([t, d]) => [t, d]));
}

function amazonCsv(
  rows: [date: string, type: string, title: string, path: string][],
): string {
  return csv(
    ["Date Watched", "Type", "Title", "Path"],
    rows.map(([d, ty, ti, p]) => [d, ty, ti, p]),
  );
}

function byTitle(rows: HistoryRow[], title: string): HistoryRow {
  const found = rows.find((r) => r.title === title);
  assert.ok(found, `no row titled "${title}" in ${rows.map((r) => r.title).join(", ")}`);
  return found;
}

// --- seasonNumber -----------------------------------------------------------

test("seasonNumber reads the season out of a title, in either language", () => {
  assert.equal(seasonNumber("Chicago Fire - Season 13"), 13);
  assert.equal(seasonNumber("Silo - Stagione 3"), 3);
  assert.equal(seasonNumber("ONE PIECE: Season 2: Rebel Whale"), 2);
  assert.equal(seasonNumber("SEASON 7"), 7);
});

test("seasonNumber rejects what is not a season", () => {
  assert.equal(seasonNumber("Dune: Part Two"), null);
  assert.equal(seasonNumber("Se7en"), null);
  // Amazon exports really do contain rows like this one.
  assert.equal(seasonNumber("Some Show - Season 201"), null);
  assert.equal(seasonNumber("Some Show - Season 0"), null);
});

// --- withoutSeason ----------------------------------------------------------

test("withoutSeason recovers the show name from every separator used", () => {
  assert.equal(withoutSeason("Chicago Fire - Season 13"), "Chicago Fire");
  assert.equal(withoutSeason("The 100: Season 3"), "The 100");
  assert.equal(withoutSeason("Silo – Stagione 3"), "Silo");
  assert.equal(withoutSeason("Dark, Stagione 2"), "Dark");
  assert.equal(withoutSeason("ONE PIECE: Season 2: Rebel Whale"), "ONE PIECE");
});

test("withoutSeason leaves a title with no season alone", () => {
  assert.equal(withoutSeason("Dune: Part Two"), "Dune: Part Two");
  assert.equal(withoutSeason("Arcane"), "Arcane");
});

test("withoutSeason keeps a number that is part of the name", () => {
  // The trap: stripping too eagerly would turn this into "Fast".
  assert.equal(withoutSeason("Fast Five"), "Fast Five");
  assert.equal(withoutSeason("Seven Seasons in Tibet"), "Seven Seasons in Tibet");
});

// --- detectFormat -----------------------------------------------------------

test("detectFormat recognises both exports and rejects anything else", () => {
  assert.equal(detectFormat('"Title","Date"\n"Arcane","01/02/25"'), "netflix");
  assert.equal(detectFormat("Title,Date\nArcane,01/02/25"), "netflix");
  // Netflix writes a BOM at the start of the file.
  assert.equal(detectFormat('﻿"Title","Date"\n'), "netflix");
  assert.equal(
    detectFormat('"Date Watched","Type","Title","Global Title Identifier"\n'),
    "amazon",
  );
  assert.equal(detectFormat("Const,Your Rating,Title\ntt0111161,10,x"), null);
  assert.equal(detectFormat(""), null);
});

// --- readNetflix ------------------------------------------------------------

test("readNetflix groups the episodes of a series into one row", () => {
  const rows = readNetflix(
    netflixCsv([
      ["Breaking Bad: Season 5: Felina", "01/15/24"],
      ["Breaking Bad: Season 5: Granite State", "01/14/24"],
      ["Breaking Bad: Season 4: Face Off", "01/02/24"],
    ]),
  );

  assert.equal(rows.length, 1);
  const bb = rows[0];
  assert.equal(bb.title, "Breaking Bad");
  assert.equal(bb.mediaType, "Series");
  // Two distinct seasons appear, however many episodes there were.
  assert.equal(bb.watchedSeasons, 2);
  assert.equal(bb.platform, "Netflix");
  assert.equal(bb.searchTitle, "breaking bad");
  assert.equal(bb.inWatchlist, false);
});

test("readNetflix keeps the most recent date of the group", () => {
  const rows = readNetflix(
    netflixCsv([
      ["Breaking Bad: Season 1: Pilot", "03/07/24"],
      ["Breaking Bad: Season 1: Cat's in the Bag...", "12/31/23"],
    ]),
  );
  // 7 March 2024, in the export's own MM/DD/YY.
  assert.deepEqual(rows[0].lastWatchedAt, new Date(2024, 2, 7));
});

test("readNetflix treats a repeated prefix as a series even with no keyword", () => {
  // "Stranger Things 5" carries no "Season"/"Episode" word: the only signal
  // that this is one series is that the prefix comes back twice.
  const rows = readNetflix(
    netflixCsv([
      ["Stranger Things: Stranger Things 5: Chapter Eight", "02/01/24"],
      ["Stranger Things: Stranger Things 5: Chapter Seven", "01/31/24"],
    ]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Stranger Things");
  assert.equal(rows[0].mediaType, "Series");
  // No "Season N" anywhere, so the count is unknown rather than wrong.
  assert.equal(rows[0].watchedSeasons, null);
});

test("readNetflix keeps a one-off colon title as a film", () => {
  const rows = readNetflix(netflixCsv([["Zack Snyder's Justice League", "05/05/24"]]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mediaType, "Movie");
  assert.equal(rows[0].watchedSeasons, null);
});

test("readNetflix keeps a film and its sequel apart", () => {
  // The regression this pins: "Part" used to count as a series keyword
  // unconditionally, so these two films became one row titled "Dune", typed
  // as a series, with the sequel gone from the catalog.
  const rows = readNetflix(
    netflixCsv([
      ["Dune", "06/01/24"],
      ["Dune: Part Two", "06/02/24"],
    ]),
  );
  assert.equal(rows.length, 2);
  assert.equal(byTitle(rows, "Dune").mediaType, "Movie");
  assert.equal(byTitle(rows, "Dune: Part Two").mediaType, "Movie");
});

test('readNetflix still groups a miniseries written as "Show: Block: Part N"', () => {
  // The shape "Part" was in the keyword list for, and the reason it is kept
  // for three-segment titles: one part watched is still a series, even with
  // nothing to group it with.
  const rows = readNetflix(
    netflixCsv([["Kaleidoscope: Limited Series: Part 1", "01/01/24"]]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Kaleidoscope");
  assert.equal(rows[0].mediaType, "Series");
});

test("readNetflix merges two films sharing an exact colon prefix", () => {
  // A known limit, not an accident: the prefix recurs, which is the only
  // signal the export gives for a series like Stranger Things. Two films
  // named this way are indistinguishable from one. Pinned so that changing
  // the recurrence rule is a deliberate decision.
  const rows = readNetflix(
    netflixCsv([
      ["Harry Potter and the Deathly Hallows: Part 1", "01/01/24"],
      ["Harry Potter and the Deathly Hallows: Part 2", "01/02/24"],
    ]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Harry Potter and the Deathly Hallows");
});

test("readNetflix survives blank titles and missing dates", () => {
  const rows = readNetflix(
    netflixCsv([
      ["", "01/01/24"],
      ["Arcane", ""],
    ]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Arcane");
  assert.equal(rows[0].lastWatchedAt, null);
});

test("readNetflix links back to a search for the title", () => {
  const rows = readNetflix(netflixCsv([["Arcane", "01/01/24"]]));
  assert.equal(rows[0].link, "https://www.netflix.com/search?q=Arcane");
});

// --- readAmazon -------------------------------------------------------------

test("readAmazon collapses a series exported one season per row", () => {
  // The bug this guards: grouping on Path put Chicago Fire in the catalog
  // eleven times, because Amazon gives every season its own Path.
  const rows = readAmazon(
    amazonCsv([
      ["2025-07-18 21:40:11.000", "Series", "Chicago Fire - Season 11", "/detail/A"],
      ["2025-07-11 22:05:44.000", "Series", "Chicago Fire - Season 10", "/detail/B"],
      ["2025-07-04 20:12:03.000", "Series", "Chicago Fire - Season 9", "/detail/C"],
    ]),
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Chicago Fire");
  assert.equal(rows[0].mediaType, "Series");
  assert.equal(rows[0].watchedSeasons, 3);
  assert.equal(rows[0].platform, "Amazon Prime Video");
});

test("readAmazon counts a season watched twice only once", () => {
  const rows = readAmazon(
    amazonCsv([
      ["2025-07-18 21:40:11.000", "Series", "Fallout - Season 1", "/detail/A"],
      ["2025-01-02 10:00:00.000", "Series", "Fallout - Season 1", "/detail/A"],
    ]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].watchedSeasons, 1);
  assert.deepEqual(rows[0].lastWatchedAt, new Date("2025-07-18T21:40:11.000"));
});

test("readAmazon keeps films with the same Path together and others apart", () => {
  const rows = readAmazon(
    amazonCsv([
      ["2025-05-01 20:00:00.000", "Movie", "The Tomorrow War", "/detail/X?ref=1"],
      ["2025-05-09 21:00:00.000", "Movie", "The Tomorrow War", "/detail/X?ref=2"],
      ["2025-05-10 21:00:00.000", "Movie", "Air", "/detail/Y"],
    ]),
  );
  assert.equal(rows.length, 2);
  // Same film, watched twice: the query string must not split it in two.
  assert.deepEqual(
    byTitle(rows, "The Tomorrow War").lastWatchedAt,
    new Date("2025-05-09T21:00:00.000"),
  );
  assert.equal(byTitle(rows, "Air").watchedSeasons, null);
});

test("readAmazon builds the Prime Video link from the Path", () => {
  const rows = readAmazon(
    amazonCsv([["2025-05-01 20:00:00.000", "Movie", "Air", "/detail/Y?ref=1"]]),
  );
  assert.equal(rows[0].link, "https://www.primevideo.com/detail/Y");
});

test("readAmazon leaves the link empty when there is no Path", () => {
  const rows = readAmazon(
    amazonCsv([["2025-05-01 20:00:00.000", "Movie", "Air", ""]]),
  );
  assert.equal(rows[0].link, null);
});

test("readAmazon ignores an unparsable date instead of failing", () => {
  const rows = readAmazon(
    amazonCsv([["not a date", "Movie", "Air", "/detail/Y"]]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lastWatchedAt, null);
});

test("readAmazon keeps a series whose title has no season", () => {
  const rows = readAmazon(
    amazonCsv([["2025-05-01 20:00:00.000", "Series", "Reacher", "/detail/Z"]]),
  );
  assert.equal(rows[0].title, "Reacher");
  assert.equal(rows[0].mediaType, "Series");
  assert.equal(rows[0].watchedSeasons, null);
});

// --- seriesKey --------------------------------------------------------------

test("seriesKey matches an old season-carrying row against the show name", () => {
  // Rows imported before the grouping existed still read "Chicago Fire -
  // Season 5"; re-importing must recognise them, not add a duplicate.
  assert.equal(
    seriesKey("Chicago Fire - Season 5", "Series"),
    seriesKey("Chicago Fire", "Series"),
  );
});

test("seriesKey leaves films untouched", () => {
  assert.equal(seriesKey("Dune: Part Two", "Movie"), "dune: part two");
});

// --- the bundled example exports --------------------------------------------

test("the bundled example exports parse into coherent rows", async () => {
  const { readFile } = await import("node:fs/promises");
  const netflix = await readFile("prisma/seed-data/NetflixViewingHistory.example.csv", "utf8");
  const amazon = await readFile("prisma/seed-data/AmazonWatchHistoryExport.example.csv", "utf8");

  assert.equal(detectFormat(netflix), "netflix");
  assert.equal(detectFormat(amazon), "amazon");

  for (const rows of [readNetflix(netflix), readAmazon(amazon)]) {
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.ok(r.title.length > 0, "every row keeps a title");
      assert.equal(r.searchTitle, r.searchTitle.toLowerCase());
      assert.ok(r.mediaType === "Movie" || r.mediaType === "Series");
      assert.equal(r.status, "Watched");
      assert.equal(r.inWatchlist, false);
      // A season count only ever belongs to a series.
      if (r.mediaType === "Movie") assert.equal(r.watchedSeasons, null);
      // No row should still carry "Season N" in its name.
      assert.equal(seasonNumber(r.title), null, `"${r.title}" kept its season`);
    }
    // Grouping means one row per title, always.
    const keys = rows.map((r) => r.searchTitle);
    assert.equal(new Set(keys).size, keys.length, "duplicate rows after grouping");
  }
});

test("re-parsing the same export twice gives the same rows", () => {
  const content = netflixCsv([
    ["Breaking Bad: Season 5: Felina", "01/15/24"],
    ["Arcane: Season 1: Welcome to the Playground", "02/01/24"],
    ["Dune", "06/01/24"],
  ]);
  assert.deepEqual(readNetflix(content), readNetflix(content));
});
