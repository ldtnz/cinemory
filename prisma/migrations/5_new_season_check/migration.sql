-- Automatic "is there a new season out?" sweep (src/lib/season-check.ts):
-- a flag on each series and the interval/lock bookkeeping on Settings, the
-- same shape recommendationsLockedAt already uses.
ALTER TABLE "Title" ADD COLUMN "newSeasonAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "lastSeasonCheckAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "seasonCheckLockedAt" DATETIME;
