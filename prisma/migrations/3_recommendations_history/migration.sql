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
