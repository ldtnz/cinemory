/**
 * What the MCP endpoint can read, and how it is phrased.
 *
 * Four narrow queries rather than one "give me the catalog" tool. A model
 * asked "have I seen Dune?" should not have to pull two thousand titles
 * through its context to answer, and every row that crosses this boundary is
 * a row leaving the reader's database — so each function takes a question and
 * returns only what answers it.
 *
 * Everything here reads. Nothing writes. That is the whole safety story of the
 * endpoint: the credential travels in a URL a connector stores, so the worst
 * a leak can do is tell someone what was watched.
 */
import type { Title } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/title-key";
import { computeStats } from "@/lib/stats";
import { splitGenres } from "@/lib/genres";

/** Caps on what one call can return, so no single question can drag the whole
 *  catalog across. */
export const MAX_RESULTS = 50;
const DEFAULT_RESULTS = 20;

/** A title as the model sees it: the facts, none of the plumbing. No ids, no
 *  poster URLs, no TMDB keys — none of it helps answer a question in chat. */
export type McpTitle = {
  title: string;
  type: string;
  year: number | null;
  watchedOn: string | null;
  platform: string | null;
  rating: number | null;
  yourRating: number | null;
  genres: string[];
  seasons?: string;
};

function toMcpTitle(t: Title): McpTitle {
  const seasons =
    t.mediaType === "Series" && (t.watchedSeasons != null || (t.totalSeasons ?? 0) > 0)
      ? `${t.watchedSeasons ?? "?"} of ${(t.totalSeasons ?? 0) > 0 ? t.totalSeasons : "?"}`
      : undefined;
  return {
    title: t.title,
    type: t.mediaType,
    year: t.year,
    watchedOn: t.lastWatchedAt ? t.lastWatchedAt.toISOString().slice(0, 10) : null,
    // Watchlist entries carry "" (see src/lib/platforms.ts) and "Unknown" is
    // the IMDb import's "could not say"; neither is worth reporting as a fact.
    platform: t.platform && t.platform !== "Unknown" ? t.platform : null,
    rating: t.tmdbRating,
    yourRating: t.personalRating,
    genres: splitGenres(t.genres),
    ...(seasons ? { seasons } : {}),
  };
}

/**
 * Titles matching a free-text query, searched the way the app's own search
 * does — on the normalized title, so punctuation and case do not matter.
 *
 * `status` is what makes this answer "have I seen it?" as well as "what do I
 * have?": watched, waiting, or either.
 */
export async function searchCatalog({
  query,
  status = "any",
  mediaType,
  genre,
  limit = DEFAULT_RESULTS,
}: {
  query?: string;
  status?: "watched" | "watchlist" | "any";
  mediaType?: "Movie" | "Series";
  genre?: string;
  limit?: number;
}): Promise<{ matches: McpTitle[]; total: number }> {
  const where = {
    ...(status === "any" ? {} : { inWatchlist: status === "watchlist" }),
    ...(mediaType ? { mediaType } : {}),
    ...(query?.trim() ? { searchTitle: { contains: normalizeTitle(query) } } : {}),
    ...(genre?.trim() ? { genres: { contains: genre.trim() } } : {}),
  };

  const total = await prisma.title.count({ where });
  const rows = await prisma.title.findMany({
    where,
    orderBy: [{ lastWatchedAt: "desc" }, { title: "asc" }],
    take: Math.min(Math.max(1, limit), MAX_RESULTS),
  });
  return { matches: rows.map(toMcpTitle), total };
}

/** The numbers behind the statistics page, without the chart buckets that
 *  only make sense as bars. */
export async function catalogStats() {
  const titles = await prisma.title.findMany();
  const s = computeStats(titles);
  return {
    watched: s.total,
    movies: s.movies,
    series: s.series,
    seasonsWatched: s.seasons,
    onWatchlist: s.watchlist,
    averageTmdbRating: s.averageRating,
    ratedTitles: s.ratedCount,
    topPlatforms: s.platforms.slice(0, 5).map((b) => ({ name: b.label, titles: b.count })),
    topGenres: s.genres.slice(0, 8).map((b) => ({ name: b.label, titles: b.count })),
    busiestYears: [...s.perYear]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((b) => ({ year: b.label, titles: b.count })),
    firstWatched: s.firstWatchedTitle
      ? { title: s.firstWatchedTitle, on: s.firstWatchedAt?.toISOString().slice(0, 10) ?? null }
      : null,
    lastWatched: s.lastWatchedTitle
      ? { title: s.lastWatchedTitle, on: s.lastWatchedAt?.toISOString().slice(0, 10) ?? null }
      : null,
  };
}

/** What is waiting to be watched. */
export async function watchlist(limit = DEFAULT_RESULTS): Promise<{
  titles: McpTitle[];
  total: number;
}> {
  const where = { inWatchlist: true };
  const total = await prisma.title.count({ where });
  const rows = await prisma.title.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: Math.min(Math.max(1, limit), MAX_RESULTS),
  });
  return { titles: rows.map(toMcpTitle), total };
}

/**
 * The most recently watched titles.
 *
 * Only titles with a date, and newest first — a row whose date the import
 * never knew would otherwise sort into the middle of the answer and read as
 * though it had been watched then.
 */
export async function recentlyWatched(limit = DEFAULT_RESULTS): Promise<McpTitle[]> {
  const rows = await prisma.title.findMany({
    where: { inWatchlist: false, lastWatchedAt: { not: null } },
    orderBy: { lastWatchedAt: "desc" },
    take: Math.min(Math.max(1, limit), MAX_RESULTS),
  });
  return rows.map(toMcpTitle);
}
