import { duplicateTitleWhere, TitleIdentityIndex } from "@/lib/title-identity";
/**
 * What the MCP endpoint can read, and how it is phrased.
 *
 * Four narrow queries rather than one "give me the catalog" tool. A model
 * asked "have I seen Dune?" should not have to pull two thousand titles
 * through its context to answer, and every row that crosses this boundary is
 * a row leaving the reader's database — so each function takes a question and
 * returns only what answers it.
 *
 * The reads are the bulk of it. The three writes below are reachable only by a
 * token minted to write, and none of them deletes: they add a title, move one
 * into the watched half, or correct where and when something was watched. The
 * worst a leaked write credential can do is make the catalog wrong in ways the
 * app can see and fix — not empty it.
 */
import type { Title } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeTitle } from "@/lib/title-key";
import { parseWatchedDate } from "@/lib/watched-date";
import { computeStats } from "@/lib/stats";
import { splitGenres } from "@/lib/genres";
import { findBestTmdbMatch } from "@/lib/tmdb";
import { PLATFORMS, isValidPlatform } from "@/lib/platforms";

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
 * it on the list. Deliberately additive — nothing here removes a title, so the
 * worst a write-capable credential can do is add rows you can see and delete
 * yourself.
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

  const match = await findBestTmdbMatch(wanted, mediaType ?? "Movie");
  if (!match) {
    return { added: false, title: wanted, reason: "No match on TMDB for that title." };
  }
  const matches = await prisma.title.findMany({
    where: duplicateTitleWhere(match),
    select: { title: true, mediaType: true, tmdbId: true, year: true, inWatchlist: true, platform: true },
  });
  const existing = new TitleIdentityIndex(matches).find(match);
  if (existing) {
    return {
      added: false,
      title: existing.title,
      reason: existing.inWatchlist
        ? "Already on the watchlist."
        : `Already watched${existing.platform ? ` on ${existing.platform}` : ""}.`,
    };
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

  const matches = await prisma.title.findMany({
    where: { searchTitle: { contains: normalizeTitle(wanted) } },
    select: { id: true, title: true, inWatchlist: true, mediaType: true, year: true },
    take: 6,
  });
  if (matches.length > 1) {
    return { moved: false, title: wanted, reason: "Ambiguous title. Choose the exact work in the app." };
  }
  const row = matches[0];
  if (!row) return { moved: false, title: wanted, reason: "Not in the catalog." };
  if (!row.inWatchlist) return { moved: false, title: row.title, reason: "Already marked as watched." };

  // Same strictness as the correction below: a date that cannot be read is
  // refused rather than guessed at, because the guess is silently plausible.
  if (on !== undefined && !parseWatchedDate(on)) {
    return { moved: false, title: wanted, reason: `"${on}" is not a date. Use YYYY-MM-DD.` };
  }
  const when = on ? parseWatchedDate(on)! : new Date();
  await prisma.title.update({
    where: { id: row.id },
    data: {
      inWatchlist: false,
      status: "Watched",
      // Unrecognised or absent platform stays "Unknown" rather than inventing
      // one; the same value the IMDb import uses when it cannot tell.
      platform: platform && isValidPlatform(platform) ? platform : "Unknown",
      lastWatchedAt: when,
    },
  });
  return { moved: true, title: row.title };
}

/**
 * The one watched title a name refers to, or why it does not refer to one.
 *
 * Reading the wrong row is a wrong answer; writing to the wrong row is lost
 * data, so a correction cannot use the loose "contains" match a search can.
 * An exact normalized match is taken outright — it is the title, whatever else
 * contains those words — and anything else has to come down to a single
 * candidate, or the caller is handed the candidates and asked to be specific.
 */
async function theWatchedTitle(
  wanted: string,
): Promise<{ row: { id: number; title: string } } | { reason: string }> {
  const name = normalizeTitle(wanted);
  if (!name) return { reason: "No title given." };

  const exact = await prisma.title.findMany({
    where: { searchTitle: name, inWatchlist: false },
    select: { id: true, title: true },
  });
  if (exact.length === 1) return { row: exact[0] };
  if (exact.length > 1) return { reason: "Ambiguous title. Choose the exact work in the app." };

  const near = await prisma.title.findMany({
    where: { searchTitle: { contains: name }, inWatchlist: false },
    select: { id: true, title: true },
    take: 6,
  });
  if (near.length === 1) return { row: near[0] };
  if (near.length > 1) {
    return {
      reason:
        `"${wanted}" matches ${near.length} watched titles — ` +
        `say which: ${near.map((t) => t.title).join(", ")}.`,
    };
  }

  // Not watched is a different answer from not there at all, and the caller
  // can act on the difference: one is mark_as_watched, the other is a typo.
  const onList = await prisma.title.findFirst({
    where: { searchTitle: { contains: name }, inWatchlist: true },
    select: { title: true },
  });
  return {
    reason: onList
      ? `"${onList.title}" is on the to-watch list, not watched yet.`
      : "Not in the catalog.",
  };
}

/**
 * Correcting where or when something was watched.
 *
 * The edit the app itself offers, and the one an import gets wrong most often:
 * a platform guessed from a region, or a date that stood in for the real one.
 * It only ever touches a title already in the watched half, it changes only
 * the two fields it is given, and it cannot move a title out of that half or
 * remove it — the way back exists in the app, deliberately not here.
 */
export async function editWatched(
  title: string,
  platform?: string,
  on?: string,
): Promise<{ changed: boolean; title: string; platform?: string; watchedOn?: string | null; reason?: string }> {
  if (platform === undefined && on === undefined) {
    return { changed: false, title, reason: "Nothing to change: give a platform, a date, or both." };
  }
  if (platform !== undefined && !isValidPlatform(platform)) {
    // Listed rather than merely refused: the caller cannot see the picker the
    // app has, and "Netflix " or "Prime Video" would otherwise fail silently
    // twice before it guessed the stored spelling.
    return {
      changed: false,
      title,
      reason: `"${platform}" is not one of: ${PLATFORMS.map((p) => p.value).join(", ")}.`,
    };
  }

  let watchedAt: Date | undefined;
  if (on !== undefined) {
    const parsed = parseWatchedDate(on);
    if (!parsed) {
      return { changed: false, title, reason: `"${on}" is not a date. Use YYYY-MM-DD.` };
    }
    watchedAt = parsed;
  }

  const found = await theWatchedTitle(title);
  if ("reason" in found) return { changed: false, title, reason: found.reason };

  const updated = await prisma.title.update({
    where: { id: found.row.id },
    data: {
      ...(platform !== undefined ? { platform } : {}),
      ...(watchedAt !== undefined ? { lastWatchedAt: watchedAt } : {}),
    },
    select: { title: true, platform: true, lastWatchedAt: true },
  });

  return {
    changed: true,
    title: updated.title,
    platform: updated.platform,
    watchedOn: updated.lastWatchedAt ? updated.lastWatchedAt.toISOString().slice(0, 10) : null,
  };
}
