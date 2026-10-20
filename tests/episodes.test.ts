/**
 * The ticking rules of the episode picker (src/lib/episodes.ts): a season or
 * an episode ticks everything before it, unticking clears only what was
 * clicked, and nothing past what has aired can be watched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanWatchedEpisodes,
  completedSeasons,
  lastEpisodeLabel,
  limitToAired,
  markEpisode,
  markSeason,
  matchSeasonCount,
  parseWatchedEpisodes,
  serializeWatchedEpisodes,
  unmarkEpisode,
  unmarkSeason,
  type SeasonSummary,
} from "@/lib/episodes";

// Three seasons; the third is airing with 2 of 8 episodes out.
const summary: SeasonSummary[] = [
  { season: 1, name: "Season 1", airDate: "2020-01-01", episodeCount: 3, airedCount: 3 },
  { season: 2, name: "Season 2", airDate: "2021-01-01", episodeCount: 4, airedCount: 4 },
  { season: 3, name: "Season 3", airDate: "2026-10-01", episodeCount: 8, airedCount: 2 },
];

test("ticking a season ticks every earlier one too", () => {
  assert.deepEqual(markSeason({}, summary, 2), { 1: [1, 2, 3], 2: [1, 2, 3, 4] });
});

test("a season still airing is ticked up to what is out", () => {
  assert.deepEqual(markSeason({}, summary, 3)[3], [1, 2]);
  assert.equal(completedSeasons(markSeason({}, summary, 3), summary), 3);
});

test("ticking an episode ticks everything before it", () => {
  assert.deepEqual(markEpisode({}, summary, 2, 2), { 1: [1, 2, 3], 2: [1, 2] });
});

test("unticking clears only what was clicked", () => {
  const all = markSeason({}, summary, 2);
  assert.deepEqual(unmarkSeason(all, 2), { 1: [1, 2, 3] });
  assert.deepEqual(unmarkEpisode(all, 1, 2), { 1: [1, 3], 2: [1, 2, 3, 4] });
});

test("only fully watched seasons count", () => {
  assert.equal(completedSeasons(markEpisode({}, summary, 2, 3), summary), 1);
  assert.equal(completedSeasons({ 2: [1, 2, 3, 4] }, summary), 1);
});

test("episodes not out yet and unknown seasons are dropped", () => {
  assert.deepEqual(limitToAired({ 3: [1, 2, 5], 9: [1] }, summary), { 3: [1, 2] });
});

test("a season count from the card's −/+ moves the episodes with it", () => {
  const partial = { 1: [1, 2, 3], 2: [1, 2, 3, 4], 3: [1] };
  assert.equal(completedSeasons(matchSeasonCount(partial, summary, 1), summary), 1);
  assert.deepEqual(matchSeasonCount(partial, summary, 1)[3], [1]);
  assert.equal(completedSeasons(matchSeasonCount({}, summary, 3), summary), 3);
});

test("what a request sends is cleaned, and nothing stores as null", () => {
  assert.deepEqual(cleanWatchedEpisodes({ 1: [3, 1, 1, -2, 1.5, "4"], x: [1], 0: [1], 2: [] }), {
    1: [1, 3],
  });
  assert.deepEqual(cleanWatchedEpisodes([1, 2]), {});
  assert.equal(serializeWatchedEpisodes({}), null);
  assert.deepEqual(parseWatchedEpisodes(serializeWatchedEpisodes({ 2: [1] })), { 2: [1] });
  assert.deepEqual(parseWatchedEpisodes("not json"), {});
});

test("the furthest episode watched", () => {
  assert.equal(lastEpisodeLabel({ 1: [1, 2, 3], 2: [1, 2] }), "S2 · E2");
  assert.equal(lastEpisodeLabel({}), null);
});
