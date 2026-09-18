import type { Prisma } from "@prisma/client";

/**
 * The columns the catalog grid is built from, and nothing else.
 *
 * The page hands the whole catalog to the client in one go — that is what
 * makes filtering, search and sorting instant and keeps the URL at "/" — so
 * every column travels once per title, on every load. Most of them are never
 * read there: `backdropUrl` and `link` are unused, `personalRating` only
 * reaches the recommendations on the server, and `overview` is four lines in
 * one dialog, for one title at a time, which /api/titles/[id] now fetches on
 * demand.
 *
 * Modelled on a 1,366-title catalog with realistic TMDB text: every column is
 * 1,381 KB (213 KB gzipped), this selection 645 KB (62 KB gzipped). The
 * synopses alone were more than half of it.
 */
export const CATALOG_TITLE_SELECT = {
  id: true,
  title: true,
  // The client searches on it, so it cannot be recomputed there cheaply.
  searchTitle: true,
  platform: true,
  mediaType: true,
  status: true,
  lastWatchedAt: true,
  totalSeasons: true,
  watchedSeasons: true,
  newSeasonAvailable: true,
  inWatchlist: true,
  tmdbId: true,
  posterUrl: true,
  tmdbRating: true,
  year: true,
  genres: true,
  // The default sort falls back to it for watchlist entries, which have no
  // watched date — so this one column does have to travel.
  createdAt: true,
} satisfies Prisma.TitleSelect;

/** A catalog row as the client sees it: use this, not Prisma's Title, for
 *  anything that renders the grid. A full Title is assignable to it, so the
 *  rows that come back from the API still fit. */
export type CatalogTitle = Prisma.TitleGetPayload<{ select: typeof CATALOG_TITLE_SELECT }>;
