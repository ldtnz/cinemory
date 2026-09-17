/**
 * The rule that watched seasons cannot exceed the seasons that exist.
 *
 * The dialog's disabled plus is only the polite half of it: the same function
 * runs on the server, where a hand-made request has no buttons to obey. The
 * total is not in here as something to set — it is TMDB's answer, fetched
 * automatically — only as the ceiling it imposes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_SEASON_COUNT, hasSeasonTotal, clampWatchedSeasons } from "@/lib/season-counts";

test("watched is capped at the total", () => {
  assert.equal(clampWatchedSeasons(9, 5), 5);
  assert.equal(clampWatchedSeasons(5, 5), 5);
  assert.equal(clampWatchedSeasons(3, 5), 3);
});

test("no total means no ceiling", () => {
  // A series nobody has a count for still has progress worth recording, and
  // the two ways of not knowing have to behave the same.
  assert.equal(clampWatchedSeasons(40, null), 40);
  assert.equal(clampWatchedSeasons(40, undefined), 40);
  assert.equal(clampWatchedSeasons(40, NO_SEASON_COUNT), 40);
  assert.equal(clampWatchedSeasons(40, 0), 40);
});

test("zero watched is stored as nothing, not as a zero", () => {
  // The posters show "x of y" only when x is a number, so "none watched" and
  // "no idea" have to be the same stored value.
  assert.equal(clampWatchedSeasons(0, 4), null);
  assert.equal(clampWatchedSeasons(-5, 4), null);
});

test("anything that is not a whole number is nothing", () => {
  for (const junk of [null, undefined, 1.5, NaN, "3" as unknown as number]) {
    assert.equal(clampWatchedSeasons(junk, 6), null, `${String(junk)} became a count`);
  }
});

test("a total of one still caps", () => {
  // The off-by-one worth checking: a single-season series watched "twice".
  assert.equal(clampWatchedSeasons(2, 1), 1);
});

test("only a positive number counts as knowing the total", () => {
  assert.equal(hasSeasonTotal(3), true);
  assert.equal(hasSeasonTotal(null), false);
  assert.equal(hasSeasonTotal(undefined), false);
  assert.equal(hasSeasonTotal(0), false);
  assert.equal(hasSeasonTotal(NO_SEASON_COUNT), false);
});
