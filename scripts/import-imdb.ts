/**
 * Imports the titles you rated on IMDb (the "ratings.csv" export) that are not
 * already in the catalog (de-duplicated on normalised title + year).
 *
 * For every new title it:
 *  - looks it up on TMDB through the exact IMDb ID (the /find endpoint) rather
 *    than a text search, so there are no false positives;
 *  - checks the TMDB "watch providers" for your region to guess the platform
 *    (Netflix / Disney+ / Amazon Prime Video). If it is not streaming on any of
 *    them the title is marked as "Cinema";
 *  - enriches it with poster, rating, year and genres, the same way db:enrich
 *    does.
 *
 * Source: prisma/seed-data/ImdbRatings.csv (IMDb export: Const,Your Rating,
 * Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),
 * Year,Genres,Num Votes,Release Date,Directors). When that file is missing the
 * bundled ImdbRatings.example.csv sample is read instead.
 *
 * Language and region come from the app's Settings row (set on first run or
 * from the settings page), read from the local database like everything else
 * this script touches.
 *
 * Run with: npx tsx scripts/import-imdb.ts
 * Add --dry-run to print the report without writing to the database.
 */
// Must come first: it makes .env visible to everything below.
import "./load-env";
import { PrismaClient } from "@prisma/client";
import { resolveLocalDatabaseUrl } from "@/lib/prisma";
import { parse } from "csv-parse/sync";
import fs from "node:fs";
import path from "node:path";

// The local SQLite file. To work on the hosted catalog, pull it down first
// with `npm run db:sync`.
const prisma = new PrismaClient({
  datasources: { db: { url: resolveLocalDatabaseUrl() } },
});

const API_KEY = process.env.TMDB_API_KEY;
const ACCESS_TOKEN = process.env.TMDB_ACCESS_TOKEN;
const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 5;
const IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE = "https://image.tmdb.org/t/p/w780";
const SEED_DIR = path.join(__dirname, "..", "prisma", "seed-data");
const OWN_CSV = path.join(SEED_DIR, "ImdbRatings.csv");
const SAMPLE_CSV = path.join(SEED_DIR, "ImdbRatings.example.csv");
const CSV_PATH = fs.existsSync(OWN_CSV) ? OWN_CSV : SAMPLE_CSV;

if (!API_KEY && !ACCESS_TOKEN) {
  console.error("Missing TMDB_API_KEY or TMDB_ACCESS_TOKEN in the .env file.");
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

/** Normalises a title for search / de-duplication (lowercase, no accents or extra punctuation). */
function normalize(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// IMDb localises the "Title Type" column ("Movie"/"TV Series" in English,
// "Film"/"Serie TV" in Italian, and so on), so anything that looks like a show
// counts as a series and everything else as a movie.
function mediaTypeFromImdb(titleType: string): "Movie" | "Series" {
  return /\b(tv|serie|series|mini)/i.test(titleType) ? "Series" : "Movie";
}

/** IMDb CSV date, in any format Date understands, -> Date. */
function parseDate(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

type ImdbRow = {
  Const: string;
  "Your Rating": string;
  "Date Rated": string;
  Title: string;
  "Title Type": string;
  Year: string;
  Genres: string;
};

type GenreMap = Map<number, string>;

async function genresByMediaType(endpoint: "movie" | "tv", language: string): Promise<GenreMap> {
  const url = withKey(new URL(`https://api.themoviedb.org/3/genre/${endpoint}/list`));
  url.searchParams.set("language", language);
  const res = await fetchWithRetry(url);
  const map: GenreMap = new Map();
  if (!res) return map;
  const data = (await res.json()) as { genres?: { id: number; name: string }[] };
  for (const g of data.genres ?? []) map.set(g.id, g.name);
  return map;
}

type TmdbMatch = {
  id: number;
  mediaType: "movie" | "tv";
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

/** Looks the title up on TMDB by exact IMDb ID: no ambiguity about which one it is. */
async function findByImdbId(imdbId: string, language: string): Promise<TmdbMatch | null> {
  const url = withKey(new URL(`https://api.themoviedb.org/3/find/${imdbId}`));
  url.searchParams.set("external_source", "imdb_id");
  url.searchParams.set("language", language);
  const res = await fetchWithRetry(url);
  if (!res) return null;
  const data = (await res.json()) as {
    movie_results?: TmdbMatch[];
    tv_results?: TmdbMatch[];
  };
  if (data.movie_results && data.movie_results.length > 0) {
    return { ...data.movie_results[0], mediaType: "movie" };
  }
  if (data.tv_results && data.tv_results.length > 0) {
    return { ...data.tv_results[0], mediaType: "tv" };
  }
  return null;
}

/** Streaming platform in TMDB_REGION among the ones the catalog uses, or null if none. */
async function streamingPlatform(
  tmdbId: number,
  mediaType: "movie" | "tv",
  regionCode: string,
): Promise<string | null> {
  const url = withKey(
    new URL(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/watch/providers`),
  );
  const res = await fetchWithRetry(url);
  if (!res) return null;
  const data = (await res.json()) as {
    results?: Record<string, { flatrate?: { provider_name: string }[] }>;
  };
  const region = data.results?.[regionCode];
  const names = (region?.flatrate ?? []).map((p) => p.provider_name);

  if (names.some((n) => n === "Netflix")) return "Netflix";
  if (names.some((n) => n === "Disney Plus")) return "Disney+";
  if (names.some((n) => n === "Amazon Prime Video")) return "Amazon Prime Video";
  return null;
}

async function main() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const language = settings?.language ?? "en-US";
  const region = settings?.region ?? "US";

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`File not found: ${OWN_CSV}`);
    process.exit(1);
  }
  if (CSV_PATH === SAMPLE_CSV) {
    console.log("ImdbRatings.csv not found, using the ImdbRatings.example.csv sample.");
  }

  const rows = parse(fs.readFileSync(CSV_PATH, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
  }) as ImdbRow[];

  console.log(`${rows.length} rows in the IMDb export.`);

  // Builds the de-duplication index from the existing catalog: normalised title
  // -> set of years already present for that title.
  const existing = await prisma.title.findMany({
    select: { searchTitle: true, year: true },
  });
  const existingIndex = new Map<string, Set<number | null>>();
  for (const e of existing) {
    if (!existingIndex.has(e.searchTitle)) {
      existingIndex.set(e.searchTitle, new Set());
    }
    existingIndex.get(e.searchTitle)!.add(e.year);
  }

  function alreadyPresent(normalisedTitle: string, year: number | null): boolean {
    const years = existingIndex.get(normalisedTitle);
    if (!years) return false;
    if (years.has(year)) return true;
    // Tolerates a one-year gap between the IMDb year and the TMDB one (it
    // happens for releases that straddle December/January).
    if (year !== null) {
      for (const y of years) {
        if (y !== null && Math.abs(y - year) <= 1) return true;
      }
    }
    return years.has(null);
  }

  const fresh: ImdbRow[] = [];
  let skippedExisting = 0;
  for (const row of rows) {
    const imdbYear = row.Year ? parseInt(row.Year, 10) : null;
    if (alreadyPresent(normalize(row.Title), isNaN(imdbYear!) ? null : imdbYear)) {
      skippedExisting++;
      continue;
    }
    fresh.push(row);
  }

  console.log(
    `${skippedExisting} already in the catalog, ${fresh.length} to evaluate/import.`,
  );

  if (fresh.length === 0) {
    console.log("Nothing to import.");
    return;
  }

  const [movieGenres, seriesGenres] = await Promise.all([
    genresByMediaType("movie", language),
    genresByMediaType("tv", language),
  ]);

  type Outcome = {
    row: ImdbRow;
    mediaType: "Movie" | "Series";
    platform: string;
    tmdbMatch: TmdbMatch | null;
  };

  const outcomes: Outcome[] = [];
  const queue = [...fresh];
  let processed = 0;

  async function worker() {
    while (queue.length > 0) {
      const row = queue.pop();
      if (!row) break;
      const mediaType = mediaTypeFromImdb(row["Title Type"]);

      let match: TmdbMatch | null = null;
      let platform = "Cinema";
      try {
        match = await findByImdbId(row.Const, language);
        if (match) {
          const fromStreaming = await streamingPlatform(match.id, match.mediaType, region);
          if (fromStreaming) platform = fromStreaming;
        }
      } catch (e) {
        console.error(`Error on "${row.Title}":`, e);
      }

      outcomes.push({ row, mediaType, platform, tmdbMatch: match });
      processed++;
      if (processed % 25 === 0 || processed === fresh.length) {
        console.log(`  ${processed}/${fresh.length} processed`);
      }
      await sleep(60);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const perPlatform = new Map<string, number>();
  let withoutTmdbMatch = 0;
  for (const e of outcomes) {
    perPlatform.set(e.platform, (perPlatform.get(e.platform) ?? 0) + 1);
    if (!e.tmdbMatch) withoutTmdbMatch++;
  }

  console.log("\nPlatforms assigned:");
  for (const [p, n] of perPlatform) console.log(`  ${p}: ${n}`);
  console.log(
    `Not found on TMDB (no enrichment, they will be flagged for poster review): ${withoutTmdbMatch}`,
  );

  if (DRY_RUN) {
    console.log("\n--dry-run active: nothing written to the database.");
    console.log("\nFirst 15 titles that would be imported:");
    for (const e of outcomes.slice(0, 15)) {
      console.log(
        `  [${e.platform}] ${e.row.Title} (${e.row.Year}) — ${e.mediaType}${
          e.tmdbMatch ? "" : " — NOT found on TMDB"
        }`,
      );
    }
    return;
  }

  let inserted = 0;
  for (const e of outcomes) {
    const t = e.tmdbMatch;
    const genreMap = t?.mediaType === "tv" ? seriesGenres : movieGenres;
    const genres = t
      ? (t.genre_ids ?? []).map((id) => genreMap.get(id)).filter(Boolean).join(", ")
      : null;
    const releaseDate = t?.release_date || t?.first_air_date;
    const tmdbYear = releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null;
    const finalTitle = (t?.title || t?.name || e.row.Title).trim();

    await prisma.title.create({
      data: {
        title: finalTitle,
        searchTitle: normalize(finalTitle),
        platform: e.platform,
        mediaType: e.mediaType,
        status: "Watched",
        lastWatchedAt: parseDate(e.row["Date Rated"]),
        personalRating: e.row["Your Rating"] ? Number(e.row["Your Rating"]) : null,
        tmdbId: t?.id ?? null,
        posterUrl: t?.poster_path ? `${IMAGE_BASE}${t.poster_path}` : null,
        backdropUrl: t?.backdrop_path ? `${BACKDROP_BASE}${t.backdrop_path}` : null,
        overview: t?.overview || null,
        tmdbRating: t?.vote_average || null,
        year:
          tmdbYear && !isNaN(tmdbYear)
            ? tmdbYear
            : e.row.Year
              ? parseInt(e.row.Year, 10)
              : null,
        genres: genres || null,
      },
    });
    inserted++;
  }

  console.log(`\nDone. ${inserted} new titles imported.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
