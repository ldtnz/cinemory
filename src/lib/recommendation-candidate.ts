import type { EnrichedRecommendation } from "@/lib/recommendations";
import type { TmdbCandidate } from "@/lib/tmdb";
import { normalizeTitle } from "@/lib/title-key";

/**
 * Two small helpers for identifying and converting a recommendation, shared
 * by every place one can be acted on — the "To watch" strip, the
 * "Recommended for you" modal, and the server side that generates and
 * dismisses them.
 *
 * Only type imports and normalizeTitle (itself dependency-free) above: this
 * file must stay safe to import from client components without pulling in
 * src/lib/recommendations.ts's server-only code (the Anthropic SDK, Prisma)
 * into the browser bundle.
 */

/**
 * The identity of a recommendation, for de-duplication and for the
 * DismissedRecommendation table's unique key: a TMDB id when there is one
 * (Claude's suggestion was confirmed against TMDB), the normalized title
 * otherwise. The same rule the rest of the app uses to recognise "the same
 * work" when there is no reliable id.
 */
export function recommendationKey(rec: { tmdbId: number | null; title: string }): string {
  return rec.tmdbId != null && rec.tmdbId > 0
    ? `tmdb:${rec.tmdbId}`
    : `title:${normalizeTitle(rec.title)}`;
}

/**
 * A recommendation is most of a TMDB candidate already; the rest is only
 * wanted by the search results list, so null does fine here. Lets a
 * recommendation be added to the watchlist straight from its card, without a
 * fresh TMDB search first.
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
