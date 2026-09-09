/**
 * The statistics page's numbers.
 *
 * computeStats is pure, so the arithmetic can be checked directly. Wrong
 * counts here are the kind of bug nobody notices: the page still renders,
 * the bars still look plausible.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Title } from "@prisma/client";
import { computeStats } from "@/lib/stats";

let nextId = 1;

/** A catalog row with everything filled in, so each test can override the
 *  handful of fields it actually cares about. */
function title(over: Partial<Title> = {}): Title {
  return {
    id: nextId++,
    title: "Some Title",
    searchTitle: "some title",
    platform: "Netflix",
    mediaType: "Movie",
    status: "Watched",
    lastWatchedAt: new Date(2024, 0, 15),
    totalSeasons: null,
    watchedSeasons: null,
    inWatchlist: false,
    link: null,
    tmdbId: 1,
    posterUrl: "https://example.invalid/p.jpg",
    backdropUrl: null,
    overview: null,
    tmdbRating: null,
    year: 2020,
    genres: null,
    personalRating: null,
    createdAt: new Date(2024, 0, 1),
    updatedAt: new Date(2024, 0, 1),
    ...over,
  } as Title;
}

test("an empty catalog produces zeroes, not NaN or a crash", () => {
  const s = computeStats([]);
  assert.equal(s.total, 0);
  assert.equal(s.seasons, 0);
  assert.equal(s.averageRating, null);
  assert.deepEqual(s.platforms, []);
  assert.deepEqual(s.topRated, []);
  assert.equal(s.firstWatchedAt, null);
});

test("the watchlist is counted apart from what was watched", () => {
  const s = computeStats([
    title(),
    title(),
    title({ inWatchlist: true, platform: "", lastWatchedAt: null }),
  ]);
  assert.equal(s.total, 2);
  assert.equal(s.watchlist, 1);
  // A "to watch" row must not turn up in any of the charts.
  assert.deepEqual(
    s.platforms.map((b) => b.label),
    ["Netflix"],
  );
  assert.equal(s.platforms[0].count, 2);
});

test("movies and series are split, and seasons counted", () => {
  const s = computeStats([
    title({ mediaType: "Movie" }),
    title({ mediaType: "Series", watchedSeasons: 5 }),
    title({ mediaType: "Series", watchedSeasons: 2 }),
    // No season count: watched at least once, so it counts as one.
    title({ mediaType: "Series", watchedSeasons: null }),
  ]);
  assert.equal(s.movies, 1);
  assert.equal(s.series, 3);
  assert.equal(s.seasons, 8);
});

test("the average rating ignores titles that have none", () => {
  const s = computeStats([
    title({ tmdbRating: 8 }),
    title({ tmdbRating: 6 }),
    title({ tmdbRating: null }),
  ]);
  assert.equal(s.averageRating, 7);
  assert.equal(s.ratedCount, 2);
});

test("a row with no platform is kept as Unknown rather than dropped", () => {
  const s = computeStats([title({ platform: "" }), title({ platform: "Cinema" })]);
  const total = s.platforms.reduce((n, b) => n + b.count, 0);
  assert.equal(total, 2);
  assert.ok(s.platforms.some((b) => b.label === "Unknown"));
});

test("genres are split on the comma and counted per title", () => {
  const s = computeStats([
    title({ genres: "Drama, Crime" }),
    title({ genres: "Drama" }),
    title({ genres: "" }),
    title({ genres: null }),
  ]);
  assert.deepEqual(s.genres, [
    { label: "Drama", count: 2, share: 1 },
    { label: "Crime", count: 1, share: 0.5 },
  ]);
});

test("only the ten biggest genres are charted", () => {
  const rows = Array.from({ length: 15 }, (_, i) =>
    title({ genres: `Genre ${String(i).padStart(2, "0")}` }),
  );
  assert.equal(computeStats(rows).genres.length, 10);
});

test("bars are sized against the biggest one, never against zero", () => {
  const s = computeStats([
    title({ platform: "Netflix" }),
    title({ platform: "Netflix" }),
    title({ platform: "Netflix" }),
    title({ platform: "Cinema" }),
  ]);
  assert.equal(s.platforms[0].share, 1);
  assert.ok(Math.abs(s.platforms[1].share - 1 / 3) < 1e-9);
  for (const b of s.platforms) {
    assert.ok(b.share > 0 && b.share <= 1, `share out of range: ${b.share}`);
  }
});

test("decades and years read chronologically, not by size", () => {
  const s = computeStats([
    title({ year: 1994, lastWatchedAt: new Date(2023, 5, 1) }),
    title({ year: 2005, lastWatchedAt: new Date(2021, 5, 1) }),
    title({ year: 2008, lastWatchedAt: new Date(2021, 6, 1) }),
    title({ year: 2021, lastWatchedAt: new Date(2022, 5, 1) }),
  ]);
  assert.deepEqual(
    s.decades.map((b) => b.label),
    ["1990s", "2000s", "2020s"],
  );
  assert.deepEqual(
    s.perYear.map((b) => b.label),
    ["2021", "2022", "2023"],
  );
  // 2000s has two titles and is still second, because this is a timeline.
  assert.equal(s.decades[1].count, 2);
});

test("titles with no year or no watch date are simply left out of those charts", () => {
  const s = computeStats([
    title({ year: null, lastWatchedAt: null }),
    title({ year: 2020, lastWatchedAt: new Date(2024, 0, 1) }),
  ]);
  assert.equal(s.total, 2);
  assert.equal(s.decades.length, 1);
  assert.equal(s.perYear.length, 1);
});

test("the span covers the oldest and most recent watch dates", () => {
  const s = computeStats([
    title({ lastWatchedAt: new Date(2022, 3, 5) }),
    title({ lastWatchedAt: new Date(2024, 10, 30) }),
    title({ lastWatchedAt: new Date(2023, 0, 1) }),
    title({ lastWatchedAt: null }),
  ]);
  assert.deepEqual(s.firstWatchedAt, new Date(2022, 3, 5));
  assert.deepEqual(s.lastWatchedAt, new Date(2024, 10, 30));
});

test("the best-rated list is capped, ordered, and needs a poster", () => {
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => title({ tmdbRating: 5 + i * 0.1 })),
    // No poster: nothing to show in the grid, so it stays out even though
    // its rating is the highest of all.
    title({ tmdbRating: 9.9, posterUrl: null }),
    title({ tmdbRating: null }),
  ];
  const s = computeStats(rows);
  assert.equal(s.topRated.length, 6);
  assert.ok(s.topRated.every((t) => t.posterUrl));
  const ratings = s.topRated.map((t) => t.tmdbRating ?? 0);
  assert.deepEqual(ratings, [...ratings].sort((a, b) => b - a));
  assert.ok(!ratings.includes(9.9));
});

test("computeStats does not touch the array it is given", () => {
  const rows = [title({ tmdbRating: 5 }), title({ tmdbRating: 9 })];
  const before = rows.map((t) => t.id);
  computeStats(rows);
  assert.deepEqual(
    rows.map((t) => t.id),
    before,
  );
});
