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
  readDisneyWatchlist,
  readImdb,
  readLetterboxd,
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

test("detectFormat recognises each export and rejects anything else", () => {
  assert.equal(detectFormat('"Title","Date"\n"Arcane","01/02/25"'), "netflix");
  assert.equal(detectFormat("Title,Date\nArcane,01/02/25"), "netflix");
  // Netflix writes a BOM at the start of the file.
  assert.equal(detectFormat('﻿"Title","Date"\n'), "netflix");
  assert.equal(
    detectFormat('"Date Watched","Type","Title","Global Title Identifier"\n'),
    "amazon",
  );
  // This used to be expected to return null, back when IMDb could only be
  // imported by running a script.
  assert.equal(detectFormat("Const,Your Rating,Title\ntt0111161,10,x"), "imdb");
  assert.equal(detectFormat("Name,Something\nx,y"), null);
  assert.equal(detectFormat(""), null);
});

test("detectFormat tells Letterboxd's files apart by name where it has to", () => {
  const diary = "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n";
  const ratings = "Date,Name,Year,Letterboxd URI,Rating\n";
  // watched.csv and watchlist.csv are identical inside — the whole reason the
  // file name is read at all.
  const plain = "Date,Name,Year,Letterboxd URI\n";

  assert.equal(detectFormat(diary, "diary.csv"), "letterboxd");
  assert.equal(detectFormat(ratings, "ratings.csv"), "letterboxd");
  assert.equal(detectFormat(plain, "watched.csv"), "letterboxd");
  assert.equal(detectFormat(plain, "watchlist.csv"), "letterboxd-watchlist");
  assert.equal(detectFormat(plain, "Letterboxd-Watchlist-2025.csv"), "letterboxd-watchlist");
  // Renamed, or uploaded with no name at all: read as a history, the safer
  // of the two mistakes.
  assert.equal(detectFormat(plain), "letterboxd");
  assert.equal(detectFormat(plain, "export.csv"), "letterboxd");
});

// --- readLetterboxd ---------------------------------------------------------

const LETTERBOXD_DIARY = [
  "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
  "2025-03-14,Perfect Days,2023,https://boxd.it/a,4.5,No,,2025-03-12",
  "2024-06-08,Dune: Part Two,2024,https://boxd.it/b,,No,,2024-06-07",
  "2024-11-20,Dune: Part Two,2024,https://boxd.it/b,4.0,Yes,rewatch,2024-11-19",
].join("\n");

test("readLetterboxd keeps the year, the rating and the day it was watched", () => {
  const rows = readLetterboxd(LETTERBOXD_DIARY, "watched");
  const perfectDays = rows.find((r) => r.title === "Perfect Days");
  assert.ok(perfectDays);
  assert.equal(perfectDays.year, 2023);
  // Half to five stars there, one to ten here.
  assert.equal(perfectDays.personalRating, 9);
  assert.equal(perfectDays.mediaType, "Movie");
  assert.equal(perfectDays.status, "Watched");
  assert.equal(perfectDays.inWatchlist, false);
  assert.equal(perfectDays.link, "https://boxd.it/a");
  // "Watched Date", not the day the row was logged — and read as local
  // midnight, so the calendar day survives west of Greenwich.
  assert.equal(perfectDays.lastWatchedAt?.getFullYear(), 2025);
  assert.equal(perfectDays.lastWatchedAt?.getMonth(), 2);
  assert.equal(perfectDays.lastWatchedAt?.getDate(), 12);
});

test("readLetterboxd folds a rewatch into one row, keeping the latest viewing", () => {
  const rows = readLetterboxd(LETTERBOXD_DIARY, "watched");
  const dune = rows.filter((r) => r.title === "Dune: Part Two");
  assert.equal(dune.length, 1, "three diary rows, two of them the same film");
  assert.equal(dune[0].lastWatchedAt?.getDate(), 19);
  assert.equal(dune[0].lastWatchedAt?.getMonth(), 10);
  // The first viewing carried no rating and the second did.
  assert.equal(dune[0].personalRating, 8);
});

test("readLetterboxd says nothing about where a film was watched", () => {
  const rows = readLetterboxd(LETTERBOXD_DIARY, "watched");
  for (const r of rows) assert.equal(r.platform, "Unknown");
});

test("a Letterboxd watchlist lands in the half it belongs to", () => {
  const rows = readLetterboxd(
    [
      "Date,Name,Year,Letterboxd URI",
      "2025-04-02,The Zone of Interest,2023,https://boxd.it/c",
    ].join("\n"),
    "watchlist",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "To watch");
  assert.equal(rows[0].inWatchlist, true);
  // Not watched anywhere yet, so no platform and no date — the convention
  // src/lib/platforms.ts states for the column.
  assert.equal(rows[0].platform, "");
  assert.equal(rows[0].lastWatchedAt, null);
  assert.equal(rows[0].year, 2023);
});

test("readLetterboxd ignores a row with no film on it, and junk ratings", () => {
  const rows = readLetterboxd(
    [
      "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date",
      "2025-01-01,,2020,https://boxd.it/d,3.0,No,,2025-01-01",
      "2025-01-02,Sorcerer,1977,https://boxd.it/e,,No,,not a date",
      "2025-01-03,Stalker,1979,https://boxd.it/f,99,No,,2025-01-03",
    ].join("\n"),
    "watched",
  );
  assert.deepEqual(
    rows.map((r) => r.title),
    ["Sorcerer", "Stalker"],
  );
  assert.equal(rows[0].lastWatchedAt, null, "an unreadable date is dropped, not guessed");
  assert.equal(rows[1].personalRating, null, "99 stars is not a rating");
});

test("re-parsing a Letterboxd export twice gives the same rows", () => {
  assert.deepEqual(
    readLetterboxd(LETTERBOXD_DIARY, "watched"),
    readLetterboxd(LETTERBOXD_DIARY, "watched"),
  );
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

/** The CSV public/disney-watchlist.js produces. */
function disneyCsv(rows: string[][]): string {
  return csv(["Title", "Type", "Link"], rows);
}

test("detectFormat tells a Disney+ watchlist from a Netflix export", () => {
  assert.equal(detectFormat(disneyCsv([["Andor", "Series", ""]])), "disney-watchlist");
  // Both start with a "title" column, so the order of the checks matters.
  assert.equal(detectFormat(csv(["Title", "Date"], [["Dune", "06/01/24"]])), "netflix");
  assert.equal(detectFormat("Name,Something\n\"x\",\"y\""), null);
});

test("readDisneyWatchlist marks rows as waiting, not watched", () => {
  const rows = readDisneyWatchlist(
    disneyCsv([["Turning Red", "Movie", "https://www.disneyplus.com/movies/turning-red/4k"]]),
  );
  assert.equal(rows.length, 1);
  const [r] = rows;
  assert.equal(r.title, "Turning Red");
  assert.equal(r.inWatchlist, true);
  assert.equal(r.status, "To watch");
  assert.equal(r.lastWatchedAt, null);
  assert.equal(r.watchedSeasons, null);
  // Watchlist entries have not been watched anywhere yet, so they carry no
  // platform — see src/lib/platforms.ts.
  assert.equal(r.platform, "");
});

test("readDisneyWatchlist takes the media type from the Type column", () => {
  const rows = readDisneyWatchlist(
    disneyCsv([
      ["The Bear", "Series", ""],
      ["Soul", "Movie", ""],
    ]),
  );
  assert.deepEqual(
    rows.map((r) => [r.title, r.mediaType]),
    [
      ["The Bear", "Series"],
      ["Soul", "Movie"],
    ],
  );
});

test("readDisneyWatchlist falls back to the title when Type is missing", () => {
  // The /browse/entity- URL shape says nothing about what a title is, so the
  // script leaves the column empty and the name has to settle it.
  const rows = readDisneyWatchlist(
    disneyCsv([
      ["Loki - Season 2", "", ""],
      ["Encanto", "", ""],
    ]),
  );
  assert.deepEqual(
    rows.map((r) => [r.title, r.mediaType]),
    [
      ["Loki", "Series"],
      ["Encanto", "Movie"],
    ],
  );
});

test("readDisneyWatchlist collapses a series listed once per season", () => {
  const rows = readDisneyWatchlist(
    disneyCsv([
      ["Andor", "Series", ""],
      ["Andor - Season 2", "Series", ""],
      ["Andor - Season 3", "Series", ""],
    ]),
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "Andor");
  // It is on the list to be watched, so no season has been watched yet.
  assert.equal(rows[0].watchedSeasons, null);
});

test("readDisneyWatchlist keeps only real links", () => {
  const rows = readDisneyWatchlist(
    disneyCsv([
      ["Andor", "Series", "https://www.disneyplus.com/series/andor/3x"],
      ["Soul", "Movie", ""],
      ["Luca", "Movie", "not a url"],
    ]),
  );
  assert.deepEqual(rows.map((r) => r.link), [
    "https://www.disneyplus.com/series/andor/3x",
    null,
    null,
  ]);
});

test("readDisneyWatchlist skips rows with no title", () => {
  const rows = readDisneyWatchlist(disneyCsv([["", "Movie", ""], ["Soul", "Movie", ""]]));
  assert.deepEqual(rows.map((r) => r.title), ["Soul"]);
});

test("the bundled Disney+ watchlist example parses into watchlist rows", async () => {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile("prisma/seed-data/DisneyWatchlist.example.csv", "utf8");
  assert.equal(detectFormat(content), "disney-watchlist");

  const rows = readDisneyWatchlist(content);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(r.title.length > 0);
    assert.equal(r.searchTitle, r.searchTitle.toLowerCase());
    assert.ok(r.mediaType === "Movie" || r.mediaType === "Series");
    assert.equal(r.inWatchlist, true);
    assert.equal(r.status, "To watch");
    assert.equal(r.platform, "");
    assert.equal(seasonNumber(r.title), null, `"${r.title}" kept its season`);
  }
  const keys = rows.map((r) => r.searchTitle);
  assert.equal(new Set(keys).size, keys.length, "duplicate rows after grouping");
  // The example lists Andor twice, once with a season.
  assert.equal(rows.filter((r) => r.title === "Andor").length, 1);
});

/** A row in the shape IMDb exports. */
function imdbRow(o: {
  id?: string;
  rating?: string;
  rated?: string;
  title: string;
  type?: string;
  year?: string;
}): string[] {
  return [
    o.id ?? "tt0111161",
    o.rating ?? "9",
    o.rated ?? "2025-03-14",
    o.title,
    o.title,
    `https://www.imdb.com/title/${o.id ?? "tt0111161"}`,
    o.type ?? "Movie",
    "8.5",
    "142",
    o.year ?? "1994",
    "Drama",
    "2900000",
    "1994-09-23",
    "Frank Darabont",
  ];
}
const IMDB_HEADER = ["Const", "Your Rating", "Date Rated", "Title", "Original Title", "URL", "Title Type", "IMDb Rating", "Runtime (mins)", "Year", "Genres", "Num Votes", "Release Date", "Directors"];
function imdbCsv(rows: string[][]): string {
  return csv(IMDB_HEADER, rows);
}

test("detectFormat recognises an IMDb export and does not confuse it", () => {
  assert.equal(detectFormat(imdbCsv([imdbRow({ title: "Dune" })])), "imdb");
  // The other three must still win on their own headers — IMDb also carries a
  // "Title" column, and the Amazon check keys on words IMDb does not use.
  assert.equal(detectFormat(csv(["Title", "Date"], [["Dune", "06/01/24"]])), "netflix");
  assert.equal(
    detectFormat(csv(["Date Watched", "Type", "Title", "Path"], [["2024-06-01", "Movie", "Dune", "/x"]])),
    "amazon",
  );
  assert.equal(detectFormat(csv(["Title", "Type", "Link"], [["Andor", "Series", ""]])), "disney-watchlist");
});

test("readImdb keeps the rating, the year and the IMDb link", () => {
  const [r] = readImdb(
    imdbCsv([imdbRow({ id: "tt0068646", title: "The Godfather", rating: "10", year: "1972" })]),
  );
  assert.equal(r.title, "The Godfather");
  assert.equal(r.personalRating, 10);
  assert.equal(r.year, 1972);
  assert.equal(r.link, "https://www.imdb.com/title/tt0068646");
  assert.equal(r.status, "Watched");
  assert.equal(r.inWatchlist, false);
  // Nothing in the file says where it was watched.
  assert.equal(r.platform, "Unknown");
});

test("readImdb reads Date Rated as the date watched", () => {
  const [r] = readImdb(imdbCsv([imdbRow({ title: "Dune", rated: "2024-06-01" })]));
  assert.equal(r.lastWatchedAt?.toISOString().slice(0, 10), "2024-06-01");
});

test("readImdb survives a missing or unusable date", () => {
  const [a] = readImdb(imdbCsv([imdbRow({ title: "Dune", rated: "" })]));
  assert.equal(a.lastWatchedAt, null);
  const [b] = readImdb(imdbCsv([imdbRow({ title: "Arrival", rated: "not a date" })]));
  assert.equal(b.lastWatchedAt, null);
});

test("readImdb tells a series from a film by Title Type, in any language", () => {
  const rows = readImdb(
    imdbCsv([
      imdbRow({ id: "tt1", title: "Chernobyl", type: "TV Mini Series" }),
      imdbRow({ id: "tt2", title: "Gomorra", type: "Serie TV" }),
      imdbRow({ id: "tt3", title: "Dune", type: "Film" }),
    ]),
  );
  assert.deepEqual(
    rows.map((r) => [r.title, r.mediaType]),
    [
      ["Chernobyl", "Series"],
      ["Gomorra", "Series"],
      ["Dune", "Movie"],
    ],
  );
});

test("readImdb rejects a rating outside IMDb's own scale", () => {
  const [a] = readImdb(imdbCsv([imdbRow({ title: "Dune", rating: "" })]));
  assert.equal(a.personalRating, null);
  const [b] = readImdb(imdbCsv([imdbRow({ title: "Arrival", rating: "42" })]));
  assert.equal(b.personalRating, null);
});

test("readImdb keeps one row per title", () => {
  const rows = readImdb(
    imdbCsv([
      imdbRow({ id: "tt1", title: "Dune" }),
      imdbRow({ id: "tt2", title: "Dune" }),
    ]),
  );
  assert.equal(rows.length, 1);
});

test("the bundled IMDb example parses into coherent watched rows", async () => {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile("prisma/seed-data/ImdbRatings.example.csv", "utf8");
  assert.equal(detectFormat(content), "imdb");

  const rows = readImdb(content);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(r.title.length > 0);
    assert.equal(r.searchTitle, r.searchTitle.toLowerCase());
    assert.ok(r.mediaType === "Movie" || r.mediaType === "Series");
    assert.equal(r.status, "Watched");
    assert.equal(r.inWatchlist, false);
    if (r.personalRating != null) assert.ok(r.personalRating >= 1 && r.personalRating <= 10);
    if (r.year != null) assert.ok(r.year > 1870 && r.year < 2200);
  }
  const keys = rows.map((r) => r.searchTitle);
  assert.equal(new Set(keys).size, keys.length, "duplicate rows after grouping");
});

test("re-parsing the same export twice gives the same rows", () => {
  const content = netflixCsv([
    ["Breaking Bad: Season 5: Felina", "01/15/24"],
    ["Arcane: Season 1: Welcome to the Playground", "02/01/24"],
    ["Dune", "06/01/24"],
  ]);
  assert.deepEqual(readNetflix(content), readNetflix(content));
});
