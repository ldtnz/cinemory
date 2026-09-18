/**
 * Which titles still need artwork, and the trap in asking.
 *
 * A title arrives from an import with no poster and no TMDB id. The enrichment
 * pass fills both in — unless TMDB has no match for the name the export gave
 * ("The Office: Season 3", a regional title, a typo), in which case the row is
 * left exactly as it came: `tmdbId` null, `posterUrl` null. Those are the ones
 * the settings page exists to let you fix by hand.
 *
 * Saying "not the ignored ones" as `NOT: { tmdbId: -1 }` excludes them all.
 * SQL compares against null with three-valued logic, so for a row whose tmdbId
 * is null the test `NOT (tmdbId = -1)` is null rather than true, and a row that
 * is not true is not returned. The filter meant to skip the handful of titles
 * deliberately marked "no artwork, stop asking" and instead skipped every title
 * that had never been matched — the whole point of the list.
 *
 * Hence the explicit null branch below. It reads as a redundancy and is not.
 */
import type { Prisma } from "@prisma/client";

/**
 * Stored in Title.tmdbId for a title whose missing poster was looked at and
 * deliberately left alone, so it stops coming back on the list. Negative so it
 * can never collide with a real TMDB id, matching NO_SEASON_COUNT in
 * src/lib/season-counts.ts.
 */
export const POSTER_IGNORED = -1;

/** Titles with no artwork, minus the ones deliberately ignored. */
export const MISSING_POSTER: Prisma.TitleWhereInput = {
  posterUrl: null,
  OR: [{ tmdbId: null }, { tmdbId: { not: POSTER_IGNORED } }],
};
