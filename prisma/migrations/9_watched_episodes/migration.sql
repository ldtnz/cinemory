-- Per-episode progress for series (src/lib/episodes.ts): JSON keyed by season
-- number. Null until episodes are picked, and watchedSeasons stays as it was.
ALTER TABLE "Title" ADD COLUMN "watchedEpisodes" TEXT;
