/**
 * Enriches every title in the database with data from TMDB (The Movie
 * Database): poster, backdrop, average rating, year, genres, overview.
 *
 * Requires the TMDB_API_KEY environment variable (v3 auth key) or
 * TMDB_ACCESS_TOKEN (Bearer / v4 read access token), set in .env.
 *
 * Run with: npm run db:enrich
 * Add --force to re-enrich titles that were already processed.
 */
// Must come first: it makes .env visible to everything below.
import "./load-env";
import { PrismaClient, type Title } from "@prisma/client";
import { resolveLocalDatabaseUrl } from "@/lib/prisma";

// The local SQLite file. To work on the hosted catalog, pull it down first
// with `npm run db:sync`.
const prisma = new PrismaClient({
  datasources: { db: { url: resolveLocalDatabaseUrl() } },
});

const API_KEY = process.env.TMDB_API_KEY;
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const FORCE = process.argv.includes("--force");
const CONCURRENCY = 6;
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";

if (!API_KEY && !ACCESS_TOKEN) {
  console.error(
    "Missing TMDB_API_KEY or TMDB_ACCESS_TOKEN in the .env file. See the README for how to get one.",
  );
  process.exit(1);
}

function authHeaders(): HeadersInit {
  if (ACCESS_TOKEN) return { Authorization: `Bearer ${ACCESS_TOKEN}` };
  return {};
}

function withKey(url: URL): URL {
  if (API_KEY && !ACCESS_TOKEN) url.searchParams.set("api_key", API_KEY);
  return url;
}

/** Strips season/episode suffixes from a title to improve the TMDB search. */
function cleanTitleForSearch(title: string): string {
  return title
    .replace(/[,:]?\s*(Season|Stagione)\s*\d+.*$/i, "")
    .replace(/[,:]?\s*(Miniseries|Miniserie|Part|Parte)\s*\d*.*$/i, "")
    .replace(/\s+-\s*$/, "")
    .trim();
}

type TmdbResult = {
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

async function searchWithQuery(
  query: string,
  endpoint: "movie" | "tv",
  language: string,
): Promise<TmdbResult | null> {
  for (const lang of [language, "en-US"]) {
    const url = withKey(new URL(`https://api.themoviedb.org/3/search/${endpoint}`));
    url.searchParams.set("query", query);
    url.searchParams.set("language", lang);
    url.searchParams.set("include_adult", "false");

    const res = await fetchWithRetry(url);
    if (!res) continue;
    const data = (await res.json()) as { results?: TmdbResult[] };
    if (data.results && data.results.length > 0) {
      return data.results[0];
    }
  }
  return null;
}

async function searchTmdb(
  title: string,
  mediaType: string,
  language: string,
): Promise<TmdbResult | null> {
  const endpoint = mediaType === "Series" ? "tv" : "movie";
  const query = cleanTitleForSearch(title);

  const firstAttempt = await searchWithQuery(query, endpoint, language);
  if (firstAttempt) return firstAttempt;

  // Fallback: some "orphan" episodes (watched only once, so they were not
  // grouped as a series during import) have titles shaped like "Show Name:
  // Episode Title". If searching for the full title fails, try again with just
  // the part before the colon, both as a movie and as a series.
  if (title.includes(":")) {
    const prefix = cleanTitleForSearch(title.split(":")[0].trim());
    if (prefix && prefix !== query) {
      const prefixResult =
        (await searchWithQuery(prefix, endpoint, language)) ??
        (await searchWithQuery(prefix, endpoint === "movie" ? "tv" : "movie", language));
      if (prefixResult) return prefixResult;
    }
  }

  return null;
}

async function fetchWithRetry(url: URL, attempts = 3): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? "1");
      await sleep((retryAfter || 1) * 1000);
      continue;
    }
    if (!res.ok) return null;
    return res;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function genresByMediaType(mediaType: string, language: string): Promise<Map<number, string>> {
  const endpoint = mediaType === "Series" ? "tv" : "movie";
  const url = withKey(new URL(`https://api.themoviedb.org/3/genre/${endpoint}/list`));
  url.searchParams.set("language", language);
  const res = await fetchWithRetry(url);
  const map = new Map<number, string>();
  if (!res) return map;
  const data = (await res.json()) as { genres?: { id: number; name: string }[] };
  for (const g of data.genres ?? []) map.set(g.id, g.name);
  return map;
}

async function processTitle(
  t: Title,
  movieGenres: Map<number, string>,
  seriesGenres: Map<number, string>,
  language: string,
): Promise<"found" | "not_found" | "error"> {
  try {
    const result = await searchTmdb(t.title, t.mediaType, language);
    if (!result) {
      await prisma.title.update({
        where: { id: t.id },
        // -1 = searched for but not found, so it is not searched again every run.
        data: { tmdbId: -1 },
      });
      return "not_found";
    }

    const genreMap = t.mediaType === "Series" ? seriesGenres : movieGenres;
    const genres = (result.genre_ids ?? [])
      .map((id) => genreMap.get(id))
      .filter(Boolean)
      .join(", ");

    const releaseDate = result.release_date || result.first_air_date;
    const year = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null;

    await prisma.title.update({
      where: { id: t.id },
      data: {
        tmdbId: result.id,
        posterUrl: result.poster_path ? `${IMAGE_BASE}${result.poster_path}` : null,
        backdropUrl: result.backdrop_path
          ? `${BACKDROP_BASE}${result.backdrop_path}`
          : null,
        overview: result.overview || null,
        tmdbRating: result.vote_average || null,
        year: year && !isNaN(year) ? year : null,
        genres: genres || null,
      },
    });
    return "found";
  } catch (e) {
    console.error(`Error on "${t.title}":`, e);
    return "error";
  }
}

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const language = settings?.language ?? "en-US";

  const where = FORCE ? {} : { tmdbId: null };
  const pending = await prisma.title.findMany({ where });

  console.log(`${pending.length} titles to enrich${FORCE ? " (--force active)" : ""}.`);
  if (pending.length === 0) {
    console.log("Nothing to do. Use --force to reprocess everything.");
    return;
  }

  const [movieGenres, seriesGenres] = await Promise.all([
    genresByMediaType("Movie", language),
    genresByMediaType("Series", language),
  ]);

  let found = 0;
  let notFound = 0;
  let errors = 0;
  let processed = 0;

  const queue = [...pending];

  async function worker() {
    while (queue.length > 0) {
      const t = queue.pop();
      if (!t) break;
      const outcome = await processTitle(t, movieGenres, seriesGenres, language);
      if (outcome === "found") found++;
      else if (outcome === "not_found") notFound++;
      else errors++;

      processed++;
      if (processed % 25 === 0 || processed === pending.length) {
        console.log(
          `  ${processed}/${pending.length} — found: ${found}, not found: ${notFound}, errors: ${errors}`,
        );
      }
      // Small pause to stay within reasonable rate limits.
      await sleep(80);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\nDone. Found: ${found}, not found: ${notFound}, errors: ${errors}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
