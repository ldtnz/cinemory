/**
 * The rule that watched seasons cannot exceed the seasons that exist.
 *
 * It has to hold from both directions — raising what you watched, and lowering
 * the total underneath it — and the dialog's disabled buttons are only the
 * polite half of it: the same function runs on the server, where a hand-made
 * request has no buttons to obey. What is checked here is that every way of
 * stating the pair comes out consistent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_SEASON_COUNT, hasSeasonTotal, normalizeSeasonCounts } from "@/lib/season-counts";

const none = { watchedSeasons: null, totalSeasons: null };

test("watched is capped at the total", () => {
  assert.deepEqual(
    normalizeSeasonCounts({ watchedSeasons: 9 }, { watchedSeasons: 1, totalSeasons: 5 }),
    { watchedSeasons: 5, totalSeasons: 5 },
  );
});

test("lowering the total pulls watched down with it", () => {
  // The other direction, and the one a dialog can get wrong: the total is the
  // field being edited, and watched has to follow rather than stay impossible.
  assert.deepEqual(
    normalizeSeasonCounts({ totalSeasons: 2 }, { watchedSeasons: 6, totalSeasons: 6 }),
    { watchedSeasons: 2, totalSeasons: 2 },
  );
});

test("no total means no ceiling", () => {
  // A series nobody has a count for still has progress worth recording.
  assert.deepEqual(normalizeSeasonCounts({ watchedSeasons: 40 }, none), {
    watchedSeasons: 40,
    totalSeasons: null,
  });
});

test("zero watched is stored as nothing, not as a zero", () => {
  // The posters show "x of y" only when x is a number, so "none watched" and
  // "no idea" have to be the same stored value.
  assert.deepEqual(
    normalizeSeasonCounts({ watchedSeasons: 0 }, { watchedSeasons: 3, totalSeasons: 4 }),
    { watchedSeasons: null, totalSeasons: 4 },
  );
  assert.deepEqual(
    normalizeSeasonCounts({ watchedSeasons: -5 }, { watchedSeasons: 3, totalSeasons: 4 }),
    { watchedSeasons: null, totalSeasons: 4 },
  );
});

test("a field that was not sent is left alone", () => {
  // Editing a platform must not clear a season count as a side effect.
  const current = { watchedSeasons: 2, totalSeasons: 7 };
  assert.deepEqual(normalizeSeasonCounts({}, current), current);
  assert.deepEqual(normalizeSeasonCounts({ watchedSeasons: 3 }, current), {
    watchedSeasons: 3,
    totalSeasons: 7,
  });
});

test("clearing a total that was already answered-as-unknown keeps the sentinel", () => {
  // Demoting it to null would put the series back in the queue the settings
  // page works through, and it would be asked again forever.
  assert.deepEqual(
    normalizeSeasonCounts({ totalSeasons: null }, { watchedSeasons: 1, totalSeasons: NO_SEASON_COUNT }),
    { watchedSeasons: 1, totalSeasons: NO_SEASON_COUNT },
  );
  // A total that was a real number and is cleared becomes "never asked", so
  // TMDB can be asked for it.
  assert.deepEqual(
    normalizeSeasonCounts({ totalSeasons: null }, { watchedSeasons: 1, totalSeasons: 4 }),
    { watchedSeasons: 1, totalSeasons: null },
  );
});

test("a total that is not a whole positive number is unknown, not a ceiling", () => {
  for (const junk of [0, -3, 1.5, NaN]) {
    const out = normalizeSeasonCounts({ totalSeasons: junk, watchedSeasons: 4 }, none);
    assert.equal(out.totalSeasons, null, `${junk} became a total`);
    assert.equal(out.watchedSeasons, 4, `${junk} capped something`);
  }
});

test("an absurd total is clamped rather than stored", () => {
  assert.equal(normalizeSeasonCounts({ totalSeasons: 10_000 }, none).totalSeasons, 999);
});

test("only a positive number counts as knowing the total", () => {
  assert.equal(hasSeasonTotal(3), true);
  assert.equal(hasSeasonTotal(null), false);
  assert.equal(hasSeasonTotal(undefined), false);
  assert.equal(hasSeasonTotal(0), false);
  assert.equal(hasSeasonTotal(NO_SEASON_COUNT), false);
});
