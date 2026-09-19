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

type RawTmdbResult = {
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

export type TitleCredits = {
  cast: string[];
  directors: string[];
  creators: string[];
  writers: string[];
};

type RawCreditPerson = {
  name?: string;
  order?: number;
  job?: string;
  jobs?: { job?: string; episode_count?: number }[];
};

type RawTitleDetails = {
  created_by?: RawCreditPerson[];
  credits?: { cast?: RawCreditPerson[]; crew?: RawCreditPerson[] };
  aggregate_credits?: { cast?: RawCreditPerson[]; crew?: RawCreditPerson[] };
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
  r: RawTmdbResult,
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

/** Searches TMDB as both movie and series, returning the results interleaved.
 *  `perType` caps how many of each are kept: the add-title modal wants a short
 *  list, the watchlist discovery grid wants as many as TMDB returns. */
export async function searchTmdb(query: string, perType = 6): Promise<TmdbCandidate[]> {
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
    risFilm.ok ? (risFilm.json() as Promise<{ results?: RawTmdbResult[] }>) : Promise.resolve({ results: [] }),
    risSerie.ok ? (risSerie.json() as Promise<{ results?: RawTmdbResult[] }>) : Promise.resolve({ results: [] }),
  ]);

  const movieCandidates = (dataFilm.results ?? [])
    .slice(0, perType)
    .map((r) => normalize(r, "Movie", film));
  const seriesCandidates = (dataSerie.results ?? [])
    .slice(0, perType)
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

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Suggestions shown before anything is typed in the Add title dialog. */
export async function browseTmdb(): Promise<{
  popular: TmdbCandidate[];
  newReleases: TmdbCandidate[];
}> {
  if (!isTmdbConfigured()) return { popular: [], newReleases: [] };

  const { language, region } = await getSettings();
  const { film, series } = await genreMaps(language);

  // "On the air" includes long-running series and exposes their original
  // first-air date, which made a currently airing show look like a 2006
  // release. Discover with an explicit window keeps this section about titles
  // that actually debuted recently.
  const releaseWindowEnd = new Date();
  const releaseWindowStart = new Date(releaseWindowEnd);
  releaseWindowStart.setUTCDate(releaseWindowStart.getUTCDate() - 180);
  const isoDate = (date: Date) => date.toISOString().slice(0, 10);

  async function list(
    path: "movie/popular" | "tv/popular" | "discover/movie" | "discover/tv",
    mediaType: "Movie" | "Series",
  ): Promise<TmdbCandidate[]> {
    const url = withKey(new URL(`https://api.themoviedb.org/3/${path}`));
    url.searchParams.set("language", language);
    url.searchParams.set("include_adult", "false");
    if (mediaType === "Movie") url.searchParams.set("region", region);
    if (path === "discover/movie") {
      url.searchParams.set("primary_release_date.gte", isoDate(releaseWindowStart));
      url.searchParams.set("primary_release_date.lte", isoDate(releaseWindowEnd));
      url.searchParams.set("include_video", "false");
      url.searchParams.set("sort_by", "popularity.desc");
    }
    if (path === "discover/tv") {
      url.searchParams.set("first_air_date.gte", isoDate(releaseWindowStart));
      url.searchParams.set("first_air_date.lte", isoDate(releaseWindowEnd));
      url.searchParams.set("include_null_first_air_dates", "false");
      url.searchParams.set("sort_by", "popularity.desc");
    }

    const response = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: RawTmdbResult[] };
    const genreMap = mediaType === "Movie" ? film : series;
    const candidates = (data.results ?? [])
      .filter((item) => item.poster_path && (item.title || item.name))
      .map((item) => normalize(item, mediaType, genreMap));
    if (!path.startsWith("discover/")) return candidates;

    // TMDB may filter movies by their primary date but return a localized
    // release date for `region`. Apply the same window to the displayed date
    // too, so an upcoming or old date cannot leak into New releases.
    const start = isoDate(releaseWindowStart);
    const end = isoDate(releaseWindowEnd);
    return candidates.filter(
      (candidate) =>
        candidate.dataUscita !== null &&
        candidate.dataUscita >= start &&
        candidate.dataUscita <= end,
    );
  }

  const [popularMovies, popularSeries, newMovies, newSeries] = await Promise.all([
    list("movie/popular", "Movie"),
    list("tv/popular", "Series"),
    list("discover/movie", "Movie"),
    list("discover/tv", "Series"),
  ]);

  function mix(
    movies: TmdbCandidate[],
    series: TmdbCandidate[],
    excluded = new Set<string>(),
  ): TmdbCandidate[] {
    const unique = new Map<string, TmdbCandidate>();
    for (const candidate of shuffled([...movies, ...series])) {
      const key = `${candidate.mediaType}-${candidate.tmdbId}`;
      if (!excluded.has(key)) unique.set(key, candidate);
    }
    // Return a larger pool because the client removes titles already present
    // in this user's catalog before displaying the first six.
    return [...unique.values()].slice(0, 16);
  }

  const popular = mix(popularMovies, popularSeries);
  const popularKeys = new Set(popular.map((candidate) => `${candidate.mediaType}-${candidate.tmdbId}`));
  return {
    popular,
    newReleases: mix(newMovies, newSeries, popularKeys),
  };
}

/** Cast and principal creative credits shown on demand in the title modal. */
export async function fetchTitleCredits(
  tmdbId: number,
  mediaType: "Movie" | "Series",
): Promise<TitleCredits> {
  const empty: TitleCredits = { cast: [], directors: [], creators: [], writers: [] };
  if (!isTmdbConfigured() || !(tmdbId > 0)) return empty;

  const language = (await getSettings()).language;
  const endpoint = mediaType === "Series" ? "tv" : "movie";
  const url = withKey(new URL(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}`));
  url.searchParams.set("language", language);
  url.searchParams.set(
    "append_to_response",
    mediaType === "Series" ? "aggregate_credits" : "credits",
  );

  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) return empty;
  const data = (await response.json()) as RawTitleDetails;
  const credits = mediaType === "Series" ? data.aggregate_credits : data.credits;

  const uniqueNames = (people: RawCreditPerson[], limit: number) =>
    [...new Set(people.map((person) => person.name?.trim()).filter((name): name is string => Boolean(name)))]
      .slice(0, limit);
  const cast = [...(credits?.cast ?? [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const crew = credits?.crew ?? [];
  const hasJob = (person: RawCreditPerson, jobs: Set<string>) =>
    (person.job ? jobs.has(person.job) : false) ||
    (person.jobs ?? []).some((credit) => credit.job !== undefined && jobs.has(credit.job));

  return {
    cast: uniqueNames(cast, 8),
    directors: uniqueNames(
      crew.filter((person) => hasJob(person, new Set(["Director"]))),
      3,
    ),
    creators: uniqueNames(data.created_by ?? [], 3),
    writers: uniqueNames(
      crew.filter((person) =>
        hasJob(person, new Set(["Writer", "Screenplay", "Story", "Teleplay"])),
      ),
      3,
    ),
  };
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
    const data = (await res.json()) as { results?: RawTmdbResult[] };
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
/**
 * Why a season count came back empty, which the plain number cannot say.
 *
 * "none" is TMDB's own answer and will not change by asking again: the id is
 * not a series there at all (a title matched to a film keeps a tmdbId that
 * 404s on /tv), or the entry carries no usable season list. "failed" is the
 * request not getting through — a timeout, a rate limit, TMDB being down —
 * and is worth retrying. Telling them apart is what stops a series TMDB
 * cannot answer for from being asked about forever.
 */
export type SeasonLookup =
  | { status: "ok"; totalSeasons: number }
  | { status: "none" }
  | { status: "failed" };

export async function lookupTotalSeasons(tmdbId: number): Promise<SeasonLookup> {
  if (!isTmdbConfigured() || !(tmdbId > 0)) return { status: "none" };

  const language = (await getSettings()).language;
  const url = withKey(new URL(`https://api.themoviedb.org/3/tv/${tmdbId}`));
  url.searchParams.set("language", language);

  const res = await fetch(url, { headers: authHeaders() }).catch(() => null);
  if (!res) return { status: "failed" };
  // 404 is TMDB saying there is no series under this id. Every other error
  // status is about the request, not the title.
  if (!res.ok) return res.status === 404 ? { status: "none" } : { status: "failed" };

  const data = (await res.json().catch(() => null)) as {
    number_of_seasons?: number;
    seasons?: { season_number?: number }[];
  } | null;
  if (!data) return { status: "failed" };

  if (Array.isArray(data.seasons)) {
    const real = data.seasons.filter((s) => (s.season_number ?? 0) > 0).length;
    if (real > 0) return { status: "ok", totalSeasons: real };
  }
  return typeof data.number_of_seasons === "number" && data.number_of_seasons > 0
    ? { status: "ok", totalSeasons: data.number_of_seasons }
    : { status: "none" };
}

/** The count alone, for callers that treat "no answer" and "ask again later"
 *  the same way — both simply leave what is stored untouched. */
export async function totalSeasonsFromTmdb(tmdbId: number): Promise<number | null> {
  const r = await lookupTotalSeasons(tmdbId);
  return r.status === "ok" ? r.totalSeasons : null;
}

/**
 * Where a title can be watched right now, in the region set in Settings.
 *
 * Only what a subscription or an advert pays for: TMDB also lists rentals and
 * purchases, and "you could buy it for €13.99" is not an answer to "what can I
 * watch tonight". The names are TMDB's own ("Amazon Prime Video", "Disney
 * Plus"), which is what the watchlist shows.
 *
 * TMDB updates this from JustWatch, so it is a snapshot rather than a promise
 * — hence the caller caching it for hours rather than storing it on the row.
 */
export async function fetchWatchProviders(
  tmdbId: number,
  mediaType: string,
  region: string,
): Promise<string[]> {
  if (!isTmdbConfigured() || !(tmdbId > 0)) throw new Error("Cannot check streaming availability.");
  const path = mediaType === "Series" ? "tv" : "movie";
  const url = withKey(new URL(`https://api.themoviedb.org/3/${path}/${tmdbId}/watch/providers`));

  const res = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`Streaming availability request failed (${res.status}).`);

  const data = (await res.json()) as {
    results?: Record<
      string,
      {
        flatrate?: { provider_name: string }[];
        free?: { provider_name: string }[];
        ads?: { provider_name: string }[];
      }
    >;
  } | null;

  if (!data?.results || typeof data.results !== "object" || Array.isArray(data.results)) {
    throw new Error("Invalid streaming availability response.");
  }
  const here = data.results[region];
  if (here === undefined) return [];
  if (!here || typeof here !== "object" || Array.isArray(here)) {
    throw new Error("Invalid regional streaming availability response.");
  }
  const names: string[] = [];
  for (const category of [here.flatrate, here.free, here.ads]) {
    if (category === undefined) continue;
    if (!Array.isArray(category) || category.some((p) =>
      !p || typeof p.provider_name !== "string" || !p.provider_name.trim(),
    )) {
      throw new Error("Invalid streaming provider list.");
    }
    names.push(...category.map((p) => p.provider_name));
  }
  // A title can be on half a dozen services; the card has room for two.
  return [...new Set(names)];
}

type TmdbVideo = { key: string; site: string; type: string; official?: boolean };

/** The YouTube key of the best trailer TMDB has for a title, or null. Tries
 *  the configured language first, then English: many trailers are only
 *  tagged under one or the other. */
export async function getTrailerKey(
  tmdbId: number,
  mediaType: "Movie" | "Series",
): Promise<string | null> {
  if (!isTmdbConfigured() || !(tmdbId > 0)) return null;

  const language = (await getSettings()).language;
  const endpoint = mediaType === "Series" ? "tv" : "movie";

  for (const lang of [language, "en-US"]) {
    const url = withKey(new URL(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}/videos`));
    url.searchParams.set("language", lang);
    const res = await fetch(url, { headers: authHeaders() }).catch(() => null);
    if (!res?.ok) continue;
    const data = (await res.json().catch(() => null)) as { results?: TmdbVideo[] } | null;
    const videos = data?.results ?? [];
    const trailer =
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
      videos.find((v) => v.site === "YouTube" && v.type === "Teaser");
    if (trailer) return trailer.key;
  }
  return null;
}
