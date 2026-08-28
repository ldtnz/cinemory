-- One-off migration for an existing database created before the project was
-- translated to English. It renames the table, its columns and its indexes,
-- and rewrites the stored enum-like values.
--
-- A fresh install does NOT need this: prisma/migrations/0_init already
-- creates the English schema. Run it only against a database whose table is
-- still called "Titolo".
--
-- Run against Turso with:  turso db shell <database-name> < scripts/one-off/rename-italian-schema.sql

ALTER TABLE "Titolo" RENAME TO "Title";

ALTER TABLE "Title" RENAME COLUMN "titolo" TO "title";
ALTER TABLE "Title" RENAME COLUMN "titoloRicerca" TO "searchTitle";
ALTER TABLE "Title" RENAME COLUMN "piattaforma" TO "platform";
ALTER TABLE "Title" RENAME COLUMN "tipo" TO "mediaType";
ALTER TABLE "Title" RENAME COLUMN "stato" TO "status";
ALTER TABLE "Title" RENAME COLUMN "dataUltimaVisione" TO "lastWatchedAt";
ALTER TABLE "Title" RENAME COLUMN "stagioniTotali" TO "totalSeasons";
ALTER TABLE "Title" RENAME COLUMN "stagioniViste" TO "watchedSeasons";
ALTER TABLE "Title" RENAME COLUMN "votoTmdb" TO "tmdbRating";
ALTER TABLE "Title" RENAME COLUMN "anno" TO "year";
ALTER TABLE "Title" RENAME COLUMN "generi" TO "genres";
ALTER TABLE "Title" RENAME COLUMN "votoPersonale" TO "personalRating";

DROP INDEX IF EXISTS "Titolo_piattaforma_idx";
DROP INDEX IF EXISTS "Titolo_tipo_idx";
DROP INDEX IF EXISTS "Titolo_stato_idx";
DROP INDEX IF EXISTS "Titolo_titoloRicerca_idx";

CREATE INDEX "Title_platform_idx" ON "Title"("platform");
CREATE INDEX "Title_mediaType_idx" ON "Title"("mediaType");
CREATE INDEX "Title_status_idx" ON "Title"("status");
CREATE INDEX "Title_searchTitle_idx" ON "Title"("searchTitle");

UPDATE "Title" SET "mediaType" = 'Movie'  WHERE "mediaType" = 'Film';
UPDATE "Title" SET "mediaType" = 'Series' WHERE "mediaType" = 'Serie TV';
UPDATE "Title" SET "status" = 'Watched'   WHERE "status" = 'Visto';
UPDATE "Title" SET "status" = 'To watch'  WHERE "status" = 'Da vedere';
