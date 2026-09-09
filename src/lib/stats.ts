/**
 * Everything the statistics page shows, derived from the catalog in one pass.
 *
 * It is a pure function over the rows rather than a pile of SQL aggregates:
 * the whole catalog is already loaded on the home page, the numbers are small
 * (a few thousand rows at most), and being pure means it can be tested without
 * a database — see tests/stats.test.ts.
 */
import type { Title } from "@prisma/client";

export type Bucket = {
  label: string;
  count: number;
  /** 0-1, relative to the largest bucket in the same group: the bar width. */
  share: number;
};

export type Stats = {
  /** Watched titles only — the watchlist is counted separately. */
  total: number;
  movies: number;
  series: number;
  seasons: number;
  watchlist: number;
  /** Average TMDB rating over the titles that have one, null when none do. */
  averageRating: number | null;
  ratedCount: number;
  platforms: Bucket[];
  genres: Bucket[];
  decades: Bucket[];
  /** One entry per year with any activity, oldest first. */
  perYear: Bucket[];
  /** Highest TMDB rating first; only titles with a rating and a poster. */
  topRated: Title[];
  /** The oldest and most recent watch dates, when known. */
  firstWatchedAt: Date | null;
  lastWatchedAt: Date | null;
};

/** Turns counts into bars, sorted by size, keeping at most `limit` of them. */
function toBuckets(counts: Map<string, number>, limit?: number): Bucket[] {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = limit ? entries.slice(0, limit) : entries;
  // Relative to the largest bar, not to the total: with twenty genres every
  // bar would otherwise be a sliver.
  const max = kept.length > 0 ? kept[0][1] : 0;
  return kept.map(([label, count]) => ({
    label,
    count,
    share: max > 0 ? count / max : 0,
  }));
}

function increment(counts: Map<string, number>, key: string, by = 1) {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

export function computeStats(titles: Title[]): Stats {
  const watched = titles.filter((t) => !t.inWatchlist);

  const platforms = new Map<string, number>();
  const genres = new Map<string, number>();
  const decades = new Map<string, number>();
  const years = new Map<string, number>();

  let movies = 0;
  let series = 0;
  let seasons = 0;
  let ratingSum = 0;
  let ratedCount = 0;
  let first: Date | null = null;
  let last: Date | null = null;

  for (const t of watched) {
    if (t.mediaType === "Series") {
      series += 1;
      // A series with no season count still counts as one season watched:
      // it was watched, the export just never said how much of it.
      seasons += t.watchedSeasons ?? 1;
    } else {
      movies += 1;
    }

    // Imported rows can carry an empty platform; "Unknown" keeps them visible
    // rather than silently dropping them from the chart.
    increment(platforms, t.platform || "Unknown");

    if (t.genres) {
      for (const g of t.genres.split(",")) {
        const name = g.trim();
        if (name) increment(genres, name);
      }
    }

    if (t.year != null) {
      increment(decades, `${Math.floor(t.year / 10) * 10}s`);
    }

    if (t.tmdbRating != null) {
      ratingSum += t.tmdbRating;
      ratedCount += 1;
    }

    if (t.lastWatchedAt) {
      increment(years, String(t.lastWatchedAt.getFullYear()));
      if (!first || t.lastWatchedAt < first) first = t.lastWatchedAt;
      if (!last || t.lastWatchedAt > last) last = t.lastWatchedAt;
    }
  }

  // Decades and years read as a timeline, so they keep chronological order
  // instead of the by-size order the other charts use.
  const chronological = (counts: Map<string, number>): Bucket[] => {
    const buckets = toBuckets(counts);
    return buckets.sort((a, b) => parseInt(a.label, 10) - parseInt(b.label, 10));
  };

  const topRated = watched
    .filter((t) => t.tmdbRating != null && t.posterUrl)
    .sort((a, b) => (b.tmdbRating ?? 0) - (a.tmdbRating ?? 0))
    .slice(0, 6);

  return {
    total: watched.length,
    movies,
    series,
    seasons,
    watchlist: titles.length - watched.length,
    averageRating: ratedCount > 0 ? ratingSum / ratedCount : null,
    ratedCount,
    platforms: toBuckets(platforms),
    genres: toBuckets(genres, 10),
    decades: chronological(decades),
    perYear: chronological(years),
    topRated,
    firstWatchedAt: first,
    lastWatchedAt: last,
  };
}
