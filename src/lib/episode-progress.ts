/**
 * Turns the episodes a request says were watched into the columns stored on
 * the series, checked against TMDB.
 *
 * Server-only: it asks TMDB which episodes are actually out, so the browser's
 * word is never the last one — a hand-made request cannot tick an episode
 * that has not aired, and watchedSeasons is derived here rather than sent.
 */
import {
  cleanWatchedEpisodes,
  completedSeasons,
  limitToAired,
  matchSeasonCount,
  parseWatchedEpisodes,
  serializeWatchedEpisodes,
} from "@/lib/episodes";
import { fetchSeasonSummary } from "@/lib/tmdb";

export type EpisodeColumns = {
  watchedEpisodes: string | null;
  watchedSeasons?: number | null;
  totalSeasons?: number;
};

/**
 * The columns to write for `requested` episodes. When TMDB cannot answer the
 * episodes are stored as sent, cleaned, and the season counts left alone:
 * losing a save to a TMDB outage would be worse than counts that catch up on
 * the next edit.
 */
export async function episodeColumns(tmdbId: number | null, requested: unknown): Promise<EpisodeColumns> {
  const cleaned = cleanWatchedEpisodes(requested);
  const summary = tmdbId && tmdbId > 0 ? await fetchSeasonSummary(tmdbId) : null;
  if (!summary || summary.length === 0) {
    return { watchedEpisodes: serializeWatchedEpisodes(cleaned) };
  }
  const watched = limitToAired(cleaned, summary);
  const complete = completedSeasons(watched, summary);
  return {
    watchedEpisodes: serializeWatchedEpisodes(watched),
    watchedSeasons: complete > 0 ? complete : null,
    totalSeasons: summary.length,
  };
}

/**
 * Brings stored episodes in line with a plain season count from the −/+ on a
 * card. Undefined when there is nothing to update: the series never tracked
 * episodes, or TMDB cannot say what a season holds.
 */
export async function episodesForSeasonCount(
  tmdbId: number | null,
  stored: string | null,
  count: number,
): Promise<string | null | undefined> {
  if (!stored || !tmdbId || tmdbId <= 0) return undefined;
  const summary = await fetchSeasonSummary(tmdbId);
  if (!summary || summary.length === 0) return undefined;
  return serializeWatchedEpisodes(matchSeasonCount(parseWatchedEpisodes(stored), summary, count));
}
