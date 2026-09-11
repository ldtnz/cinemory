/**
 * Genres are stored as a single comma-separated string on Title.genres
 * (TMDB's own format), so every place that needs the list back out — stats,
 * catalog filters, recommendation summaries — has to split and trim it the
 * same way. Centralized here so that stays true.
 */
export function splitGenres(genres: string | null | undefined): string[] {
  return (genres ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}
