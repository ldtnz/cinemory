-- Titles pinned to the top of the catalog, most recently pinned first.
-- Null when not pinned.
ALTER TABLE "Title" ADD COLUMN "pinnedAt" DATETIME;
