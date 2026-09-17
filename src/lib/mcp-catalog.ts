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
import { findBestTmdbMatch } from "@/lib/tmdb";
import { isValidPlatform } from "@/lib/platforms";

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

/**
 * A watched-between filter, or nothing when neither end was given.
 *
 * An unparseable date is dropped rather than allowed through as Invalid Date,
 * which Prisma would send to the database as null and quietly widen the search
 * instead of narrowing it.
 */
function dateRange(from?: string, to?: string): { gte?: Date; lte?: Date } | null {
  const start = from ? new Date(from) : null;
  const end = to ? new Date(to) : null;
  const range: { gte?: Date; lte?: Date } = {};
  if (start && !isNaN(start.getTime())) range.gte = start;
  // A bare "2024-12-31" parses to midnight, which would exclude that whole
  // day; the end of the range means the end of the day named.
  if (end && !isNaN(end.getTime())) {
    range.lte = /T/.test(to ?? "") ? end : new Date(end.getTime() + 86_399_999);
  }
  return range.gte || range.lte ? range : null;
}

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
  from,
  to,
  platform,
  limit = DEFAULT_RESULTS,
}: {
  query?: string;
  status?: "watched" | "watchlist" | "any";
  mediaType?: "Movie" | "Series";
  genre?: string;
  /** ISO dates bounding when it was watched. A catalog spanning a decade makes
   *  "what did I watch that summer?" an obvious question, and without these it
   *  could only be answered by pulling every row across. */
  from?: string;
  to?: string;
  platform?: string;
  limit?: number;
}): Promise<{ matches: McpTitle[]; total: number }> {
  const watchedAt = dateRange(from, to);
  const where = {
    ...(status === "any" ? {} : { inWatchlist: status === "watchlist" }),
    ...(mediaType ? { mediaType } : {}),
    ...(query?.trim() ? { searchTitle: { contains: normalizeTitle(query) } } : {}),
    ...(genre?.trim() ? { genres: { contains: genre.trim() } } : {}),
    ...(platform?.trim() ? { platform: { contains: platform.trim() } } : {}),
    ...(watchedAt ? { lastWatchedAt: watchedAt } : {}),
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
    // Every genre, not a top slice: these are the only strings the genre
    // filter accepts, and they are in whatever language TMDB was asked in —
    // "Dramma", not "Drama", on an Italian catalog. A caller that cannot see
    // the list guesses the English name and gets a confident zero back.
    genres: s.genres.map((b) => ({ name: b.label, titles: b.count })),
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

/**
 * Adding a title to the watchlist.
 *
 * The one write worth having in chat: you are talking about a film, you want
 * it on the list. Deliberately additive — there is no tool here that removes
 * or edits anything, so the worst a write-capable URL can do is add rows you
 * can see and delete yourself.
 *
 * It goes through TMDB like the app's own "add" does, so the entry arrives
 * with a poster and metadata rather than as a bare string.
 */
export async function addToWatchlist(
  title: string,
  mediaType?: "Movie" | "Series",
): Promise<{ added: boolean; title: string; reason?: string }> {
  const wanted = title.trim();
  if (!wanted) return { added: false, title, reason: "No title given." };

  const searchTitle = normalizeTitle(wanted);
  const existing = await prisma.title.findFirst({
    where: { searchTitle },
    select: { title: true, inWatchlist: true, platform: true },
  });
  if (existing) {
    return {
      added: false,
      title: existing.title,
      reason: existing.inWatchlist
        ? "Already on the watchlist."
        : `Already watched${existing.platform ? ` on ${existing.platform}` : ""}.`,
    };
  }

  const match = await findBestTmdbMatch(wanted, mediaType ?? "Movie");
  if (!match) {
    return { added: false, title: wanted, reason: "No match on TMDB for that title." };
  }

  // Same shape the app writes (see src/app/api/titles/route.ts): a watchlist
  // entry has no platform and no date, because neither is known until it has
  // actually been watched.
  await prisma.title.create({
    data: {
      title: match.title,
      searchTitle: normalizeTitle(match.title),
      platform: "",
      mediaType: match.mediaType,
      status: "To watch",
      inWatchlist: true,
      lastWatchedAt: null,
      tmdbId: match.tmdbId,
      posterUrl: match.posterUrl,
      backdropUrl: match.backdropUrl,
      overview: match.overview,
      tmdbRating: match.tmdbRating,
      year: match.year,
      genres: match.genres,
      totalSeasons: match.totalSeasons ?? null,
    },
  });
  return { added: true, title: match.title };
}

/**
 * Moving a title from the watchlist into the watched half.
 *
 * Only ever moves something already in the catalog, and only in that
 * direction — it cannot delete, and the move back exists in the app.
 */
export async function markAsWatched(
  title: string,
  platform?: string,
  on?: string,
): Promise<{ moved: boolean; title: string; reason?: string }> {
  const wanted = title.trim();
  if (!wanted) return { moved: false, title, reason: "No title given." };

  const row = await prisma.title.findFirst({
    where: { searchTitle: { contains: normalizeTitle(wanted) } },
    select: { id: true, title: true, inWatchlist: true },
  });
  if (!row) return { moved: false, title: wanted, reason: "Not in the catalog." };
  if (!row.inWatchlist) return { moved: false, title: row.title, reason: "Already marked as watched." };

  const when = on ? new Date(on) : new Date();
  await prisma.title.update({
    where: { id: row.id },
    data: {
      inWatchlist: false,
      status: "Watched",
      // Unrecognised or absent platform stays "Unknown" rather than inventing
      // one; the same value the IMDb import uses when it cannot tell.
      platform: platform && isValidPlatform(platform) ? platform : "Unknown",
      lastWatchedAt: isNaN(when.getTime()) ? new Date() : when,
    },
  });
  return { moved: true, title: row.title };
}
