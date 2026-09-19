import { test, before, beforeEach, after, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

// A private database: these regressions never touch a configured catalog.
let db: PrismaClient;
let directory: string;
let POST: typeof import("@/app/api/titles/route").POST;
let restoreTitles: typeof import("@/lib/restore").restoreTitles;
let parseBackup: typeof import("@/lib/restore").parseBackup;
let groupsToMerge: typeof import("@/lib/seasons").groupsToMerge;
let importHistory: typeof import("@/app/api/import/route").POST;
let markAsWatched: typeof import("@/lib/mcp-catalog").markAsWatched;
let getStoredRecommendations: typeof import("@/lib/recommendations").getStoredRecommendations;

mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => true } });
mock.module("@/lib/season-check", { namedExports: { ensureFreshSeasonCheckInBackground: () => {} } });
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "cinemory-identity-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${directory}/test.db` } } });
  const root = path.join(process.cwd(), "prisma/migrations");
  const folders = (await readdir(root)).filter(name => /^\d/.test(name)).sort((a, b) => parseInt(a) - parseInt(b));
  for (const folder of folders) {
    const sql = await readFile(path.join(root, folder, "migration.sql"), "utf8");
    for (const statement of sql.split(";").map(s => s.trim()).filter(Boolean)) {
      await db.$executeRawUnsafe(statement);
    }
  }
  mock.module("@/lib/prisma", { namedExports: { prisma: db } });
  ({ POST } = await import("@/app/api/titles/route"));
  ({ POST: importHistory } = await import("@/app/api/import/route"));
  ({ markAsWatched } = await import("@/lib/mcp-catalog"));
  ({ restoreTitles, parseBackup } = await import("@/lib/restore"));
  ({ groupsToMerge } = await import("@/lib/seasons"));
  ({ getStoredRecommendations } = await import("@/lib/recommendations"));
});
beforeEach(async () => {
  await db.title.deleteMany();
  await db.recommendation.deleteMany();
  await db.dismissedRecommendation.deleteMany();
});
after(async () => { await db?.$disconnect(); if (directory) await rm(directory, { recursive: true, force: true }); });

function candidate(extra: Record<string, unknown> = {}) {
  return { title: "Dune", mediaType: "Movie", tmdbId: 1, year: 1984, ...extra };
}
function add(extra: Record<string, unknown> = {}) {
  return POST(new NextRequest("http://localhost/api/titles", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidate: candidate(extra), watchlist: true }),
  }));
}

test("the add API accepts remakes and film/series ID collisions but rejects the same work", async () => {
  assert.equal((await add()).status, 200);
  assert.equal((await add({ tmdbId: 2, year: 2021 })).status, 200);
  assert.equal((await add({ mediaType: "Series" })).status, 200);
  assert.equal((await add({ title: "Localized title" })).status, 409);
  assert.equal((await add({ tmdbId: 3 })).status, 200);
  assert.equal(await db.title.count(), 4);
});

test("the add API falls back only to matching name, type and year", async () => {
  assert.equal((await add({ tmdbId: null })).status, 200);
  assert.equal((await add()).status, 409);
  assert.equal((await add({ tmdbId: 2, year: 2021 })).status, 200);
  assert.equal((await add({ tmdbId: null, year: null })).status, 200);
  assert.equal((await add({ tmdbId: null, year: null })).status, 409);
});

test("an unidentified homonym cannot be silently assigned to one of two known works", async () => {
  await add();
  await add({ tmdbId: 2 });
  assert.equal((await add({ tmdbId: null })).status, 200);
});

test("backup restore preserves homonyms and remains idempotent", async () => {
  const backup = parseBackup({ version: 1, titles: [candidate(), candidate({ tmdbId: 2, year: 2021 }), candidate({ mediaType: "Series" })] });
  assert.equal(backup.ok, true);
  if (!backup.ok) return;
  assert.equal((await restoreTitles(backup.rows, 3, 0)).added, 3);
  assert.equal((await restoreTitles(backup.rows, 3, 0)).alreadyPresent, 3);
});

test("season merge never groups two confirmed same-name shows", async () => {
  await add({ mediaType: "Series", title: "Dune: Season 1" });
  await add({ mediaType: "Series", tmdbId: 2, title: "Dune: Season 2" });
  const groups = await groupsToMerge();
  assert.equal(groups.length, 2);
  assert.ok(groups.every(group => group.rows.length === 1));
});

test("legacy dismissals retain their media type and do not hide an unrelated series", async () => {
  await db.dismissedRecommendation.create({ data: { key: "tmdb:1", title: "Dune", mediaType: "Movie" } });
  await db.recommendation.create({ data: { titles: JSON.stringify([candidate(), candidate({ mediaType: "Series" }), candidate({ tmdbId: 2 })]) } });
  const stored = await getStoredRecommendations();
  assert.deepEqual(stored?.titles.map(t => `${t.mediaType}:${t.tmdbId}`), ["Series:1", "Movie:2"]);
});


test("a yearless streaming import recognizes one enriched work without duplicating it", async () => {
  await add();
  const form = new FormData();
  form.append("file", new File(["Title,Date\nDune,01/01/24"], "NetflixViewingHistory.csv"));
  const response = await importHistory(new NextRequest("http://localhost/api/import", { method: "POST", body: form }));
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.added, 0);
  assert.equal(report.outcomes[0].alreadyPresent, 1);
});

test("IMDb import and repeat import preserve same-name works by year and type", async () => {
  const csv = 'Const,Title,Title Type,Year,Your Rating,Date Rated\ntt1,Dune,Movie,1984,8,2024-01-01\ntt2,Dune,Movie,2021,9,2024-01-02\ntt3,Dune,TV Series,2021,9,2024-01-02';
  for (const expected of [3, 0]) {
    const form = new FormData();
    form.append("file", new File([csv], "ratings.csv"));
    const response = await importHistory(new NextRequest("http://localhost/api/import", { method: "POST", body: form }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).added, expected);
  }
});

test("MCP refuses to mark an arbitrary homonym as watched", async () => {
  await add();
  await add({ tmdbId: 2, year: 2021 });
  assert.equal((await markAsWatched("Dune")).moved, false);
  assert.equal(await db.title.count({ where: { inWatchlist: true } }), 2);
});
