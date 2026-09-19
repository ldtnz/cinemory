import { test } from "node:test";
import assert from "node:assert/strict";
import { TitleIdentityIndex, titleIdentityKey, type TitleIdentity } from "@/lib/title-identity";
import { readLetterboxd, readImdb } from "@/lib/history";

const movie: TitleIdentity = { title: "Dune", mediaType: "Movie", tmdbId: 1, year: 1984 };

test("different TMDB IDs win over an identical name and year", () => {
  const index = new TitleIdentityIndex([movie]);
  assert.equal(index.has({ ...movie, tmdbId: 2 }), false);
  assert.equal(index.has({ ...movie, title: "Localized title", year: 2021 }), true);
});

test("the same TMDB number for a film and a series identifies different works", () => {
  assert.equal(new TitleIdentityIndex([movie]).has({ ...movie, mediaType: "Series" }), false);
  assert.notEqual(titleIdentityKey(movie), titleIdentityKey({ ...movie, mediaType: "Series" }));
});

test("fallback matches type, normalized name and year when either ID is absent", () => {
  const unresolved = { ...movie, title: "DÚNE", tmdbId: null };
  assert.equal(new TitleIdentityIndex([unresolved]).has(movie), true);
  assert.equal(new TitleIdentityIndex([movie]).has(unresolved), true);
  assert.equal(new TitleIdentityIndex([unresolved]).has({ ...movie, year: 2021 }), false);
});

test("missing years can match one work, and ignored IDs are not real identities", () => {
  const unknown = { ...movie, tmdbId: -1, year: null };
  const index = new TitleIdentityIndex([unknown]);
  assert.equal(index.has(movie), true);
  assert.equal(index.has({ ...unknown, tmdbId: 0 }), true);
  assert.equal(index.has({ ...unknown, title: "Another title" }), false);
});

test("an unresolved title does not choose between two identified homonyms", () => {
  const index = new TitleIdentityIndex([movie, { ...movie, tmdbId: 2 }]);
  assert.equal(index.has({ ...movie, tmdbId: null }), false);
});

test("Letterboxd retains different release years while combining repeat viewings", () => {
  const csv = 'Date,Name,Year,Letterboxd URI,Watched Date\n2024-01-01,Dune,1984,,2024-01-01\n2024-01-02,Dune,2021,,2024-01-02\n2024-02-01,Dune,1984,,2024-02-01';
  const rows = readLetterboxd(csv, "watched");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.year), [1984, 2021]);
});

test("IMDb retains same-name films from different years and same-name series", () => {
  const csv = 'Const,Title,Title Type,Year,Your Rating,Date Rated\ntt1,Dune,Movie,1984,8,2024-01-01\ntt2,Dune,Movie,2021,9,2024-01-02\ntt3,Dune,TV Series,2021,9,2024-01-02';
  assert.equal(readImdb(csv).length, 3);
});


test("an import with no year matches one enriched work but never chooses between remakes", () => {
  const unknown = { ...movie, tmdbId: null, year: null };
  assert.equal(new TitleIdentityIndex([movie]).has(unknown), true);
  assert.equal(new TitleIdentityIndex([movie, { ...movie, tmdbId: 2, year: 2021 }]).has(unknown), false);
});
