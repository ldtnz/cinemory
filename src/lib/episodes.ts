/**
 * Which episodes of a series have been watched, and the rules for ticking
 * them.
 *
 * Stored on Title.watchedEpisodes as JSON keyed by season number, each value
 * the watched episode numbers in order: {"1":[1,2,3],"2":[1]}. Nothing here
 * touches the database or TMDB, because both sides need it: the picker runs it
 * in the browser to tick boxes, and the routes run it again on the way in to
 * clean what a hand-made request sends and to derive watchedSeasons from it.
 * Same reasoning as src/lib/season-counts.ts.
 */

/** Season number -> watched episode numbers, ascending. */
export type WatchedEpisodes = Record<number, number[]>;

/** A season as the picker needs it, from one call to TMDB's series details. */
export type SeasonSummary = {
  season: number;
  name: string;
  airDate: string | null;
  episodeCount: number;
  /** Episodes already out. Only these can be ticked: a season still airing
   *  counts as watched once everything released so far is. */
  airedCount: number;
};

/** One episode as the picker lists it, from TMDB's season details. */
export type EpisodeDetail = {
  episode: number;
  name: string;
  overview: string | null;
  /** Minutes. */
  runtime: number | null;
  airDate: string | null;
  stillUrl: string | null;
};

/** Reads the stored JSON; anything malformed reads as nothing watched. */
export function parseWatchedEpisodes(raw: string | null | undefined): WatchedEpisodes {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  return cleanWatchedEpisodes(data);
}

/**
 * Keeps only positive whole season and episode numbers, sorted and without
 * repeats, and drops empty seasons. Takes `unknown` because it is also what a
 * request body goes through.
 */
export function cleanWatchedEpisodes(data: unknown): WatchedEpisodes {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const result: WatchedEpisodes = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const season = Number(key);
    if (!Number.isInteger(season) || season <= 0 || !Array.isArray(value)) continue;
    const episodes = [
      ...new Set(value.filter((e): e is number => Number.isInteger(e) && e > 0)),
    ].sort((a, b) => a - b);
    if (episodes.length > 0) result[season] = episodes;
  }
  return result;
}

/** Null for nothing watched, so "never tracked" and "none" store the same. */
export function serializeWatchedEpisodes(watched: WatchedEpisodes): string | null {
  return countWatchedEpisodes(watched) > 0 ? JSON.stringify(watched) : null;
}

export function countWatchedEpisodes(watched: WatchedEpisodes): number {
  return Object.values(watched).reduce((sum, episodes) => sum + episodes.length, 0);
}

export function isEpisodeWatched(watched: WatchedEpisodes, season: number, episode: number) {
  return watched[season]?.includes(episode) ?? false;
}

function airedOf(summary: SeasonSummary[], season: number): number {
  return summary.find((s) => s.season === season)?.airedCount ?? 0;
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

function withSeason(watched: WatchedEpisodes, season: number, episodes: number[]) {
  const next = { ...watched };
  if (episodes.length > 0) next[season] = [...new Set(episodes)].sort((a, b) => a - b);
  else delete next[season];
  return next;
}

/** Every released episode of the season is ticked. A season with nothing
 *  released yet is never complete. */
export function isSeasonComplete(
  watched: WatchedEpisodes,
  summary: SeasonSummary[],
  season: number,
): boolean {
  const aired = airedOf(summary, season);
  if (aired <= 0) return false;
  const seen = new Set(watched[season] ?? []);
  return range(aired).every((e) => seen.has(e));
}

/**
 * Ticking a season means having watched everything up to it: that season and
 * every earlier one, released episodes only.
 */
export function markSeason(
  watched: WatchedEpisodes,
  summary: SeasonSummary[],
  season: number,
): WatchedEpisodes {
  let next = watched;
  for (const s of summary) {
    if (s.season > season) continue;
    next = withSeason(next, s.season, [...(next[s.season] ?? []), ...range(s.airedCount)]);
  }
  return next;
}

/** Unticking a season clears that season only: earlier ones stay watched. */
export function unmarkSeason(watched: WatchedEpisodes, season: number): WatchedEpisodes {
  return withSeason(watched, season, []);
}

/**
 * Ticking an episode means having watched everything before it too: the
 * earlier episodes of its season and every earlier season.
 */
export function markEpisode(
  watched: WatchedEpisodes,
  summary: SeasonSummary[],
  season: number,
  episode: number,
): WatchedEpisodes {
  const next = markSeason(watched, summary, season - 1);
  return withSeason(next, season, [...(next[season] ?? []), ...range(episode)]);
}

/** Unticking an episode clears that one only. */
export function unmarkEpisode(
  watched: WatchedEpisodes,
  season: number,
  episode: number,
): WatchedEpisodes {
  return withSeason(
    watched,
    season,
    (watched[season] ?? []).filter((e) => e !== episode),
  );
}

/**
 * Drops what cannot have been watched: seasons TMDB does not list and
 * episodes past what has been released.
 */
export function limitToAired(
  watched: WatchedEpisodes,
  summary: SeasonSummary[],
): WatchedEpisodes {
  const result: WatchedEpisodes = {};
  for (const [key, episodes] of Object.entries(watched)) {
    const season = Number(key);
    const aired = airedOf(summary, season);
    const kept = episodes.filter((e) => e <= aired);
    if (kept.length > 0) result[season] = kept;
  }
  return result;
}

/** How many seasons are fully watched: what watchedSeasons holds once
 *  progress is tracked per episode. */
export function completedSeasons(watched: WatchedEpisodes, summary: SeasonSummary[]): number {
  return summary.filter((s) => isSeasonComplete(watched, summary, s.season)).length;
}

/**
 * Sets the episodes to match a plain season count, for the −/+ on a card:
 * the first `count` seasons fully watched, and anything after the count that
 * was complete made incomplete again, or the count would not stick. Partial
 * progress on later seasons is left alone.
 */
export function matchSeasonCount(
  watched: WatchedEpisodes,
  summary: SeasonSummary[],
  count: number,
): WatchedEpisodes {
  const ordered = [...summary].sort((a, b) => a.season - b.season);
  let next = watched;
  ordered.forEach((s, index) => {
    if (index < count) {
      next = withSeason(next, s.season, [...(next[s.season] ?? []), ...range(s.airedCount)]);
    } else if (isSeasonComplete(next, summary, s.season)) {
      next = unmarkSeason(next, s.season);
    }
  });
  return next;
}

/** The furthest episode watched, as "S2 · E4", or null for none. */
export function lastEpisodeLabel(watched: WatchedEpisodes): string | null {
  const seasons = Object.keys(watched).map(Number).sort((a, b) => a - b);
  const season = seasons.at(-1);
  if (season === undefined) return null;
  const episode = watched[season].at(-1);
  return episode === undefined ? null : `S${season} · E${episode}`;
}
