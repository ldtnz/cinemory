import { test } from "node:test";
import assert from "node:assert/strict";
import { semanticSearch, type SemanticSearchTitle } from "@/lib/semantic-search";

const NOW = new Date("2026-09-20T12:00:00.000Z");

function title(id: number, name: string, extra: Partial<SemanticSearchTitle> = {}): SemanticSearchTitle {
  return {
    id,
    title: name,
    searchTitle: name.toLowerCase(),
    overview: null,
    genres: null,
    mediaType: "Movie",
    platform: "Netflix",
    year: 2020,
    lastWatchedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...extra,
  };
}

const catalog = [
  title(1, "Interstellar", {
    overview: "Esploratori attraversano un wormhole nello spazio per trovare un nuovo pianeta.",
    genres: "Drama, Science Fiction",
    lastWatchedAt: new Date("2018-03-02T00:00:00.000Z"),
  }),
  title(2, "La vita è bella", {
    overview: "Un padre italiano protegge il figlio con umorismo e immaginazione.",
    genres: "Comedy, Drama",
    year: 1997,
    lastWatchedAt: new Date("2017-06-10T00:00:00.000Z"),
  }),
  title(3, "The Bear", {
    overview: "A young chef returns to run his family's restaurant.",
    genres: "Drama, Comedy",
    mediaType: "Series",
  }),
  title(4, "Apollo 13", {
    overview: "Astronauts fight to return from orbit after a spacecraft accident.",
    genres: "Drama, History",
    year: 1995,
  }),
];

test("a mood and setting query searches genres and overviews", () => {
  assert.deepEqual(semanticSearch(catalog, "film malinconici ambientati nello spazio", NOW).map((r) => r.id), [1, 4]);
});

test("media type is a real constraint", () => {
  assert.deepEqual(semanticSearch(catalog, "serie divertenti sulla famiglia", NOW).map((r) => r.id), [3]);
});

test("natural time wording boosts things watched years ago", () => {
  const ids = semanticSearch(catalog, "commedie italiane che ho visto anni fa", NOW).map((r) => r.id);
  assert.equal(ids[0], 2);
  assert.ok(!ids.includes(3), "the query asked for movies, not a series");
});

test("an explicit year works with descriptive words", () => {
  assert.deepEqual(semanticSearch(catalog, "film spaziale del 1995", NOW).map((r) => r.id), [4, 1]);
});

test("unrelated prose does not return the entire catalog", () => {
  assert.deepEqual(semanticSearch(catalog, "qualcosa con pinguini ballerini", NOW), []);
});
