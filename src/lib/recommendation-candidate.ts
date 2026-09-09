import type { EnrichedRecommendation } from "@/lib/recommendations";
import type { TmdbCandidate } from "@/lib/tmdb";

/**
 * A recommendation is most of a TMDB candidate already; the rest is only
 * wanted by the search results list, so null does fine here. Shared by every
 * place a recommendation can be added to the watchlist straight from its
 * card — the "To watch" strip and the "Recommended for you" modal — so it
 * never has to go through a fresh TMDB search first.
 *
 * Only type imports above: this file must stay safe to import from client
 * components without pulling in src/lib/recommendations.ts's server-only
 * code (the Anthropic SDK, Prisma) into the browser bundle.
 */
export function recommendationToCandidate(rec: EnrichedRecommendation): TmdbCandidate {
  return {
    // Null means TMDB had no match for what Claude suggested. Zero is the
    // "no id" value the API already understands: it falls back to matching
    // on the normalized title alone when checking for duplicates.
    tmdbId: rec.tmdbId ?? 0,
    mediaType: rec.mediaType,
    title: rec.title,
    year: rec.year,
    dataUscita: null,
    totalSeasons: null,
    posterUrl: rec.posterUrl,
    backdropUrl: null,
    overview: null,
    tmdbRating: rec.tmdbRating,
    genres: rec.genres,
  };
}
