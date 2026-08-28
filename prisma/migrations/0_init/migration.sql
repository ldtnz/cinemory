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
