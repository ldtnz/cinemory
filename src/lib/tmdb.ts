// TMDB helpers, shared between the enrichment script (scripts/enrich-tmdb.ts)
// and the search route used by the settings page to link missing posters by
// hand.
//
// The language sent to TMDB (titles, overviews, genre names) is the one
// chosen in the setup wizard, read from the Settings row — see
// src/lib/settings.ts.

import { getSettings } from "@/lib/settings";

const API_KEY = process.env.TMDB_API_KEY;
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";

export function isTmdbConfigured(): boolean {
  return Boolean(API_KEY || ACCESS_TOKEN);
}

function authHeaders(): HeadersInit {
  if (ACCESS_TOKEN) return { Authorization: `Bearer ${ACCESS_TOKEN}` };
  return {};
}

function withKey(url: URL): URL {
  if (API_KEY && !ACCESS_TOKEN) url.searchParams.set("api_key", API_KEY);
  return url;
}

type RisultatoTmdbGrezzo = {
  id: number;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  vote_average: number | null;
  genre_ids?: number[];
  release_date?: string;
  first_air_date?: string;
  title?: string;
  name?: string;
};

export type TmdbCandidate = {
  tmdbId: number;
  mediaType: "Movie" | "Series";
  title: string;
  year: number | null;
  /** Full release date (ISO). Only used by the results list; the catalog
   *  stores the year alone. */
  dataUscita: string | null;
  /** How many seasons the series has. Null for movies and until asked for:
   *  the search does not return it, it takes an extra request. */
  totalSeasons: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  tmdbRating: number | null;
  genres: string | null;
};

// Keyed by language, so a warm serverless instance picks up a language change
// made later on the settings page instead of keeping the first one it saw.
const genreCache = new Map<string, { film: Map<number, string>; series: Map<number, string> }>();

async function genresByMediaType(
  endpoint: "movie" | "tv",
  language: string,
): Promise<Map<number, string>> {
  const url = withKey(new URL(`https://api.themoviedb.org/3/genre/${endpoint}/list`));
  url.searchParams.set("language", language);
  const res = await fetch(url, { headers: authHeaders() });
  const mappa = new Map<number, string>();
  if (!res.ok) return mappa;
  const data = (await res.json()) as { genres?: { id: number; name: string }[] };
  for (const g of data.genres ?? []) mappa.set(g.id, g.name);
  return mappa;
}

async function genreMaps(language: string) {
  const cached = genreCache.get(language);
  if (cached) return cached;
  const [film, series] = await Promise.all([
    genresByMediaType("movie", language),
    genresByMediaType("tv", language),
  ]);
  const maps = { film, series };
  genreCache.set(language, maps);
  return maps;
}

function normalize(
  r: RisultatoTmdbGrezzo,
  mediaType: "Movie" | "Series",
  mappaGeneri: Map<number, string>,
): TmdbCandidate {
  const dataUscita = r.release_date || r.first_air_date;
  const year = dataUscita ? parseInt(dataUscita.slice(0, 4), 10) : null;
  const genres = (r.genre_ids ?? [])
    .map((id) => mappaGeneri.get(id))
    .filter(Boolean)
    .join(", ");

  return {
    tmdbId: r.id,
    mediaType,
    title: r.title || r.name || "",
    year: year && !isNaN(year) ? year : null,
    dataUscita: dataUscita || null,
    totalSeasons: null,
    posterUrl: r.poster_path ? `${IMAGE_BASE}${r.poster_path}` : null,
    backdropUrl: r.backdrop_path ? `${BACKDROP_BASE}${r.backdrop_path}` : null,
    overview: r.overview || null,
    tmdbRating: r.vote_average || null,
    genres: genres || null,
  };
}

/** Searches TMDB as both movie and series, returning the results interleaved. */
export async function searchTmdb(query: string): Promise<TmdbCandidate[]> {
  if (!isTmdbConfigured() || !query.trim()) return [];

  const language = (await getSettings()).language;
  const { film, series } = await genreMaps(language);

  const [risFilm, risSerie] = await Promise.all([
    fetch(
      withKey(
        (() => {
          const u = new URL("https://api.themoviedb.org/3/search/movie");
          u.searchParams.set("query", query);
          u.searchParams.set("language", language);
          u.searchParams.set("include_adult", "false");
          return u;
        })(),
      ),
      { headers: authHeaders() },
    ),
    fetch(
      withKey(
        (() => {
          const u = new URL("https://api.themoviedb.org/3/search/tv");
          u.searchParams.set("query", query);
          u.searchParams.set("language", language);
          u.searchParams.set("include_adult", "false");
          return u;
        })(),
      ),
      { headers: authHeaders() },
    ),
  ]);

  const [dataFilm, dataSerie] = await Promise.all([
    risFilm.ok ? (risFilm.json() as Promise<{ results?: RisultatoTmdbGrezzo[] }>) : Promise.resolve({ results: [] }),
    risSerie.ok ? (risSerie.json() as Promise<{ results?: RisultatoTmdbGrezzo[] }>) : Promise.resolve({ results: [] }),
  ]);

  const movieCandidates = (dataFilm.results ?? [])
    .slice(0, 6)
    .map((r) => normalize(r, "Movie", film));
  const seriesCandidates = (dataSerie.results ?? [])
    .slice(0, 6)
    .map((r) => normalize(r, "Series", series));

  // Interleave movies and series instead of listing them in two blocks.
  const results: TmdbCandidate[] = [];
  const max = Math.max(movieCandidates.length, seriesCandidates.length);
  for (let i = 0; i < max; i++) {
    if (movieCandidates[i]) results.push(movieCandidates[i]);
    if (seriesCandidates[i]) results.push(seriesCandidates[i]);
  }
  return results;
}

/**
 * Cleans a title before searching TMDB: history exports drag along "Season 2",
 * "Part 1" and the like, which are not part of the work's name on TMDB.
 */
function cleanTitleForSearch(title: string): string {
  return title
    .replace(/[,:]?\s*(Season|Stagione)\s*\d+.*$/i, "")
    .replace(/[,:]?\s*(Miniseries|Miniserie|Part|Parte)\s*\d*.*$/i, "")
    .replace(/\s+-\s*$/, "")
    .trim();
}

async function firstResult(
  query: string,
  endpoint: "movie" | "tv",
  mappaGeneri: Map<number, string>,
  language: string,
): Promise<TmdbCandidate | null> {
  // Configured language first, then English: some titles only exist on TMDB
  // under their original name.
  for (const lang of [language, "en-US"]) {
    const url = withKey(new URL(`https://api.themoviedb.org/3/search/${endpoint}`));
    url.searchParams.set("query", query);
    url.searchParams.set("language", lang);
    url.searchParams.set("include_adult", "false");

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) continue;
    const data = (await res.json()) as { results?: RisultatoTmdbGrezzo[] };
    const primo = data.results?.[0];
    if (primo) {
      return normalize(primo, endpoint === "movie" ? "Movie" : "Series", mappaGeneri);
    }
  }
  return null;
}

/**
 * Finds the most likely TMDB candidate for an imported title, without asking
 * the user to confirm. Same strategy as scripts/enrich-tmdb.ts: first the
 * cleaned title against the right endpoint (movie or series), then, if that
 * finds nothing, just the part before the colon — episodes watched only once
 * keep a name shaped like "Show Name: Episode Title".
 */
/** Fills in the total season count on a candidate, when it is a series. */
async function withSeasons(c: TmdbCandidate): Promise<TmdbCandidate> {
  if (c.mediaType !== "Series") return c;
  return { ...c, totalSeasons: await totalSeasonsFromTmdb(c.tmdbId) };
}

export async function findBestTmdbMatch(
  title: string,
  mediaType: string,
): Promise<TmdbCandidate | null> {
  if (!isTmdbConfigured() || !title.trim()) return null;

  const language = (await getSettings()).language;
  const { film, series } = await genreMaps(language);
  const endpoint = mediaType === "Series" ? "tv" : "movie";
  const genres = endpoint === "tv" ? series : film;
  const query = cleanTitleForSearch(title);
  if (!query) return null;

  const diretto = await firstResult(query, endpoint, genres, language);
  if (diretto) return withSeasons(diretto);

  if (title.includes(":")) {
    const prefix = cleanTitleForSearch(title.split(":")[0].trim());
    if (prefix && prefix !== query) {
      const otherEndpoint = endpoint === "movie" ? "tv" : "movie";
      const found =
        (await firstResult(prefix, endpoint, genres, language)) ??
        (await firstResult(prefix, otherEndpoint, otherEndpoint === "tv" ? series : film, language));
      return found ? await withSeasons(found) : null;
    }
  }

  return null;
}

/**
 * How many seasons a series has according to TMDB.
 *
 * The search does not return it: that takes the details endpoint, one call per
 * title. Which is why it is not filled in while typing (that would be six
 * extra requests per keystroke) but only when a title is actually added or
 * enriched.
 *
 * It counts real seasons: TMDB includes "specials" (season 0) in its own
 * count, which is not a season as far as a viewer is concerned.
 */
export async function totalSeasonsFromTmdb(tmdbId: number): Promise<number | null> {
  if (!isTmdbConfigured() || !(tmdbId > 0)) return null;

  const language = (await getSettings()).language;
  const url = withKey(new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`));
  url.searchParams.set("language", language);

  const res = await fetch(url, { headers: authHeaders() }).catch(() => null);
  if (!res?.ok) return null;

  const data = (await res.json().catch(() => null)) as {
    number_of_seasons?: number;
    seasons?: { season_number?: number }[];
  } | null;
  if (!data) return null;

  if (Array.isArray(data.seasons)) {
    const vere = data.seasons.filter((s) => (s.season_number ?? 0) > 0).length;
    if (vere > 0) return vere;
  }
  return typeof data.number_of_seasons === "number" && data.number_of_seasons > 0
    ? data.number_of_seasons
    : null;
}
