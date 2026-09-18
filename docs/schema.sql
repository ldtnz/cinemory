-- Cinemory: the whole schema, for a database that has none yet.
--
-- Generated from prisma/migrations by `npm run db:sql` — do not edit by hand.
--
-- Paste this into Turso's SQL console (or any SQLite client) to set up a new
-- database. It expects an empty one: run against a database that already has
-- these tables it will stop at the first "table already exists", which is
-- harmless but means there was nothing to do.
--
-- The alternative, for anyone with the repository checked out, is
-- `npm run db:migrate-turso`, which applies the same files and can be re-run
-- safely at any time.

-- ----- 0_init -----

-- CreateTable
CREATE TABLE "Title" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "searchTitle" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastWatchedAt" DATETIME,
    "totalSeasons" INTEGER,
    "watchedSeasons" INTEGER,
    "inWatchlist" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "tmdbId" INTEGER,
    "posterUrl" TEXT,
    "backdropUrl" TEXT,
    "overview" TEXT,
    "tmdbRating" REAL,
    "year" INTEGER,
    "genres" TEXT,
    "personalRating" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Title_platform_idx" ON "Title"("platform");

-- CreateIndex
CREATE INDEX "Title_mediaType_idx" ON "Title"("mediaType");

-- CreateIndex
CREATE INDEX "Title_status_idx" ON "Title"("status");

-- CreateIndex
CREATE INDEX "Title_searchTitle_idx" ON "Title"("searchTitle");

-- ----- 1_settings -----

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "language" TEXT NOT NULL DEFAULT 'en-US',
    "region" TEXT NOT NULL DEFAULT 'US',
    "totpSecret" TEXT,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- ----- 2_recommendations -----

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "titles" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----- 3_recommendations_history -----

-- Recommendation becomes an append-only history (one row per generation)
-- instead of a singleton overwritten in place. Safe to drop and recreate:
-- no deployment has ever successfully written a row to it.
DROP TABLE IF EXISTS "Recommendation";

CREATE TABLE "Recommendation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titles" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Recommendation_generatedAt_idx" ON "Recommendation"("generatedAt");

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "recommendationsLockedAt" DATETIME;

-- ----- 4_dismissed_recommendations -----

-- "Not interested" on an AI recommendation: kept forever, not per-batch, so
-- it stays excluded across every future generation.
CREATE TABLE "DismissedRecommendation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "dismissedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "DismissedRecommendation_key_key" ON "DismissedRecommendation"("key");

-- ----- 5_new_season_check -----

-- Automatic "is there a new season out?" sweep (src/lib/season-check.ts):
-- a flag on each series and the interval/lock bookkeeping on Settings, the
-- same shape recommendationsLockedAt already uses.
ALTER TABLE "Title" ADD COLUMN "newSeasonAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "lastSeasonCheckAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "seasonCheckLockedAt" DATETIME;

-- ----- 6_mcp_token -----

-- The MCP endpoint's credential: a SHA-256 digest, never the token itself.
-- Null (the default for existing rows) leaves the endpoint switched off.
ALTER TABLE "Settings" ADD COLUMN "mcpTokenHash" TEXT;
ALTER TABLE "Settings" ADD COLUMN "mcpTokenCreatedAt" DATETIME;
