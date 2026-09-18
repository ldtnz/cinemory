/**
 * What the catalog's own search box matches.
 *
 * It used to test the query as a single substring of the normalized title,
 * which quietly required the words to be contiguous and in the stored order:
 * "wars empire" found nothing at all. The query was also only lowercased,
 * while every title it is compared against has its accents stripped — so
 * typing a title exactly as it is written, accents and all, was the one way
 * to guarantee no match.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesSearchWords, normalizeTitle, searchWords } from "@/lib/title-key";

const matches = (title: string, query: string) =>
  matchesSearchWords(normalizeTitle(title), searchWords(query));

test("the words may be in any order and need not touch", () => {
  const title = "Star Wars: The Empire Strikes Back";
  assert.ok(matches(title, "star wars"));
  assert.ok(matches(title, "wars empire"));
  assert.ok(matches(title, "empire star"));
  assert.ok(matches(title, "strikes"));
});

test("every word still has to be there", () => {
  const title = "Star Wars: The Empire Strikes Back";
  assert.ok(!matches(title, "star trek"));
  assert.ok(!matches(title, "empire dune"));
});

test("a query typed with its accents finds the title", () => {
  assert.ok(matches("Amélie", "amélie"));
  assert.ok(matches("Amélie", "amelie"));
  assert.ok(matches("La Città Incantata", "citta incantata"));
  assert.ok(matches("La Città Incantata", "città"));
});

test("case and stray spaces do not matter", () => {
  assert.ok(matches("The Matrix Reloaded", "  MATRIX   reloaded "));
});

test("an empty query matches nothing in itself", () => {
  // The grid checks the word count before calling this; with no words every
  // title would pass, which is the same thing as not filtering.
  assert.deepEqual(searchWords("   "), []);
  assert.ok(matchesSearchWords("anything", []));
});

test("a partial word still matches, the way a substring search should", () => {
  assert.ok(matches("The Godfather", "father"));
  assert.ok(matches("Interstellar", "stell"));
});
