/**
 * Parsing of the Netflix and Amazon Prime Video watch-history exports, the
 * IMDb ratings export, and a Disney+ watchlist collected with
 * public/disney-watchlist.js.
 *
 * Shared between the initial seed (prisma/seed.ts, which wipes and refills the
 * catalog) and the incremental import on the settings page (which only adds
 * what is missing). The grouping heuristics are delicate, and keeping them in
 * one place stops the two paths from drifting apart.
 */
import { parse } from "csv-parse/sync";

// Re-exported so the existing importers of this module keep working; it lives
// in its own file because the client needs it too and must not pull in the
// CSV parser above. See src/lib/title-key.ts.
export { normalizeTitle } from "@/lib/title-key";
import { normalizeTitle } from "@/lib/title-key";
import { fallbackIdentity } from "@/lib/title-identity";

export type HistoryRow = {
  title: string;
  searchTitle: string;
  platform: string;
  mediaType: string;
  status: string;
  lastWatchedAt: Date | null;
  /** How many distinct seasons appear in the export. Null when the series
   *  does not carry season numbers in its titles (or for a movie). */
  watchedSeasons: number | null;
  inWatchlist: boolean;
  link: string | null;
  /** Only IMDb carries one: the streaming exports say nothing about what you
   *  made of anything. */
  personalRating?: number | null;
  /** IMDb states the year outright; the others leave it to TMDB enrichment. */
  year?: number | null;
};

export type Format =
  | "netflix"
  | "amazon"
  | "disney-watchlist"
  | "imdb"
  | "letterboxd"
  | "letterboxd-watchlist";

// Netflix and Prime Video localise the exported titles to the account's own
// language, so the season keywords are matched in English and in Italian (the
// language this catalog was first built against). Add your own if your export
// uses different words.
const SERIES_KEYWORDS = /\b(Season|Episode|Miniseries|Stagione|Episodio|Miniserie)\b/i;

// "Part" is a series marker in Netflix's "Show: Limited Series: Part 1" shape
// and an ordinary word in a film's, which is why it is kept apart from the
// list above: on its own it merged "Dune" and "Dune: Part Two" into a single
// row typed as a series, losing one of the two films. It is only trusted in
// the three-segment shape a series title has, never in a film's "Name: Part N".
const PART_KEYWORD = /\b(Part|Parte)\b/i;

function looksLikeSeries(rawTitle: string): boolean {
  if (SERIES_KEYWORDS.test(rawTitle)) return true;
  return PART_KEYWORD.test(rawTitle) && rawTitle.split(":").length >= 3;
}

// "Chicago Fire - Season 13", "Silo - Stagione 3", "Dexter Stagione 1":
// the season number appears in the title in both export formats.
const SEASON_PATTERN = /\b(?:season|stagione)\s*(\d{1,3})\b/i;

/** Season number found inside a title, when present and plausible. */
export function seasonNumber(title: string): number | null {
  const m = title.match(SEASON_PATTERN);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  // Exports contain the occasional nonsense number (one Amazon row reads
  // "Season 201"): past 100 seasons it is garbage, not data.
  return n >= 1 && n <= 100 ? n : null;
}

/** Strips the trailing "- Season N" from a title to recover the show name. */
export function withoutSeason(title: string): string {
  return (
    title
      .replace(/\s*[-–—:]?\s*\b(?:season|stagione)\s*\d{1,3}\b.*$/i, "")
      // Netflix writes "The 100: Season 3": once the season is stripped a
      // dangling colon is left, which would otherwise make "The 100:" a
      // different series from "The 100".
      .replace(/\s*[-–—:,]+\s*$/, "")
      .trim()
  );
}

/**
 * Detects which service a CSV came from by looking at its header row, so the
 * user can upload files without declaring which is which. Returns null when it
 * is none of the expected formats.
 */
export function detectFormat(content: string, fileName?: string): Format | null {
  const header = content.slice(0, 500).toLowerCase();
  // "Const" is IMDb's name for its tt-id column and heads no other export.
  if (header.trimStart().startsWith("const,") || header.includes("your rating")) {
    return "imdb";
  }
  // Letterboxd names the column after itself, in every file of the export.
  if (header.includes("letterboxd uri")) {
    // diary.csv and ratings.csv say outright that they are about films
    // watched. watched.csv and watchlist.csv have the same header as each
    // other — "Date,Name,Year,Letterboxd URI" — and only the file name tells
    // them apart, which is why it is read here. A renamed file is taken as a
    // history: it is the larger of the two and the safer mistake, since a
    // title in the wrong half can be moved back in one click.
    if (/watchlist/i.test(fileName ?? "")) return "letterboxd-watchlist";
    return "letterboxd";
  }
  if (header.includes("global title identifier") || header.includes("date watched")) {
    return "amazon";
  }
  // Disney+ publishes no export of its own, so this is the shape produced by
  // public/disney-watchlist.js. Tested before Netflix: both start with a
  // "title" column.
  if (/^\ufeff?"?title"?\s*,\s*"?type"?\s*,\s*"?link"?\s*$/i.test((header.split("\n")[0] ?? "").trim())) {
    return "disney-watchlist";
  }
  // Netflix exports just two columns: Title,Date
  if (/^﻿?"?title"?\s*,\s*"?date"?\s*$/im.test(header.split("\n")[0] ?? "")) {
    return "netflix";
  }
  return null;
}

export function readHistory(content: string, format: Format): HistoryRow[] {
  if (format === "netflix") return readNetflix(content);
  if (format === "amazon") return readAmazon(content);
  if (format === "imdb") return readImdb(content);
  if (format === "letterboxd") return readLetterboxd(content, "watched");
  if (format === "letterboxd-watchlist") return readLetterboxd(content, "watchlist");
  return readDisneyWatchlist(content);
}

export function readNetflix(content: string): HistoryRow[] {
  const records: { Title: string; Date: string }[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
  });

  // Pass 1: count how often each "prefix before the colon" shows up. Netflix
  // exports episodes as "Show Name: ...: Episode Title", but not every series
  // uses words like "Season"/"Episode" in the title (e.g. "Stranger Things:
  // Stranger Things 5: Chapter Eight: ..."). If the same prefix recurs it is
  // almost certainly a series: we group on that instead of relying on keywords
  // alone.
  const prefixCount = new Map<string, number>();
  for (const row of records) {
    const rawTitle = row.Title?.trim();
    if (!rawTitle || !rawTitle.includes(":")) continue;
    const prefix = normalizeTitle(rawTitle.split(":")[0].trim());
    prefixCount.set(prefix, (prefixCount.get(prefix) ?? 0) + 1);
  }

  const groups = new Map<
    string,
    { title: string; date: Date[]; seasons: Set<number>; isSeries: boolean }
  >();

  for (const row of records) {
    const rawTitle = row.Title?.trim();
    if (!rawTitle) continue;

    const dateStr = row.Date?.trim();
    let watchedAt: Date | null = null;
    if (dateStr) {
      const [mm, dd, yy] = dateStr.split("/").map((n) => parseInt(n, 10));
      if (mm && dd && yy) {
        watchedAt = new Date(2000 + yy, mm - 1, dd);
      }
    }

    let base = rawTitle;
    let isSeries = false;
    if (rawTitle.includes(":")) {
      const baseCandidate = rawTitle.split(":")[0].trim();
      const normalizedPrefix = normalizeTitle(baseCandidate);
      const occursOften = (prefixCount.get(normalizedPrefix) ?? 0) >= 2;
      if (occursOften || looksLikeSeries(rawTitle)) {
        base = baseCandidate;
        isSeries = true;
      }
    }

    const key = fallbackIdentity({ title: base, mediaType: isSeries ? "Series" : "Movie" });
    if (!groups.has(key)) {
      groups.set(key, { title: base, date: [], seasons: new Set(), isSeries: false });
    }
    const g = groups.get(key)!;
    if (watchedAt) g.date.push(watchedAt);
    // The season lives in the part of the title dropped by the grouping
    // ("ONE PIECE: Season 2: Rebel Whale"), so look for it in the full title
    // rather than in the show name.
    const season = seasonNumber(rawTitle);
    if (season) g.seasons.add(season);
    g.isSeries = g.isSeries || isSeries;
  }

  const rows: HistoryRow[] = [];
  for (const g of groups.values()) {
    const lastDate =
      g.date.length > 0 ? new Date(Math.max(...g.date.map((d) => d.getTime()))) : null;
    rows.push({
      title: g.title,
      searchTitle: normalizeTitle(g.title),
      platform: "Netflix",
      mediaType: g.isSeries ? "Series" : "Movie",
      status: "Watched",
      lastWatchedAt: lastDate,
      watchedSeasons: g.isSeries && g.seasons.size > 0 ? g.seasons.size : null,
      inWatchlist: false,
      link: `https://www.netflix.com/search?q=${encodeURIComponent(g.title)}`,
    });
  }
  return rows;
}

export function readAmazon(content: string): HistoryRow[] {
  const records: {
    "Date Watched": string;
    Type: string;
    Title: string;
    Path: string;
  }[] = parse(content, { columns: true, skip_empty_lines: true, bom: true });

  const groups = new Map<
    string,
    { title: string; mediaType: string; date: Date[]; seasons: Set<number>; path: string }
  >();

  for (const row of records) {
    const rawTitle = row.Title?.trim();
    if (!rawTitle) continue;
    const mediaType = row.Type?.trim() === "Series" ? "Series" : "Movie";
    const path = (row.Path || "").split("?")[0];

    // Amazon exports every season as its own entry ("Silo - Season 3", with a
    // different Path per season): grouping by Path put Chicago Fire in the
    // catalog as eleven separate titles. For series we therefore group on the
    // name with the season stripped, so one row is left.
    const season = mediaType === "Series" ? seasonNumber(rawTitle) : null;
    const title = mediaType === "Series" ? withoutSeason(rawTitle) || rawTitle : rawTitle;
    const key = `${mediaType}:${mediaType === "Series" ? normalizeTitle(title) : path || normalizeTitle(title)}`;

    let watchedAt: Date | null = null;
    const dateStr = row["Date Watched"]?.trim();
    if (dateStr) {
      const d = new Date(dateStr.replace(" ", "T"));
      if (!isNaN(d.getTime())) watchedAt = d;
    }

    if (!groups.has(key)) {
      groups.set(key, { title, mediaType, date: [], seasons: new Set(), path: path });
    }
    const g = groups.get(key)!;
    if (watchedAt) g.date.push(watchedAt);
    if (season) g.seasons.add(season);
  }

  const rows: HistoryRow[] = [];
  for (const g of groups.values()) {
    const lastDate =
      g.date.length > 0 ? new Date(Math.max(...g.date.map((d) => d.getTime()))) : null;
    rows.push({
      title: g.title,
      searchTitle: normalizeTitle(g.title),
      platform: "Amazon Prime Video",
      mediaType: g.mediaType,
      status: "Watched",
      lastWatchedAt: lastDate,
      watchedSeasons: g.mediaType === "Series" && g.seasons.size > 0 ? g.seasons.size : null,
      inWatchlist: false,
      link: g.path ? `https://www.primevideo.com${g.path}` : null,
    });
  }
  return rows;
}

/**
 * The IMDb ratings export.
 *
 * Unlike the streaming exports this is a list of what you rated, not of what
 * you played — which makes it the only one that knows what you thought of a
 * title, and the only one that states the year outright rather than leaving it
 * to be guessed during enrichment. "Date Rated" stands in for when it was
 * watched: it is the closest thing the file has, and usually the same evening.
 *
 * What it cannot say is where you watched it, so the platform is "Unknown"
 * rather than a guess. scripts/import-imdb.ts, which does the same job from
 * the command line, asks TMDB's watch providers instead; that needs one
 * request per title, which is why the upload path does not.
 */
export function readImdb(content: string): HistoryRow[] {
  const records: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  });

  const seen = new Map<string, HistoryRow>();

  for (const row of records) {
    const rawTitle = (row["Title"] || row["Original Title"] || "").trim();
    if (!rawTitle) continue;

    // IMDb localises this column ("Movie"/"TV Series" in English, "Film"/
    // "Serie TV" in Italian), so it is matched loosely — anything naming a
    // series counts as one, everything else is a film.
    const mediaType = /\b(tv|serie|series|mini)/i.test(row["Title Type"] ?? "")
      ? "Series"
      : "Movie";

    const title = mediaType === "Series" ? withoutSeason(rawTitle) || rawTitle : rawTitle;
    const key = fallbackIdentity({ title: seriesKey(title, mediaType), mediaType, year: Number(row["Year"]) || null });
    if (!key || seen.has(key)) continue;

    const rated = (row["Date Rated"] || "").trim();
    const watchedAt = rated ? new Date(rated) : null;

    const stars = Number(row["Your Rating"]);
    const year = Number(row["Year"]);
    const id = (row["Const"] || "").trim();

    seen.set(key, {
      title,
      searchTitle: normalizeTitle(title),
      platform: "Unknown",
      mediaType,
      status: "Watched",
      lastWatchedAt: watchedAt && !isNaN(watchedAt.getTime()) ? watchedAt : null,
      watchedSeasons: null,
      inWatchlist: false,
      link: /^tt\d+$/.test(id) ? `https://www.imdb.com/title/${id}` : null,
      // IMDb rates out of 10 and so does this catalog, so it carries over as
      // it stands. Anything outside that range is not a rating.
      personalRating: stars >= 1 && stars <= 10 ? stars : null,
      year: year >= 1870 && year <= 2200 ? year : null,
    });
  }

  return [...seen.values()];
}

/**
 * Letterboxd, whose export is a zip of several CSVs sharing a shape:
 * Date,Name,Year,Letterboxd URI, with Rating on ratings.csv and Rating,
 * Rewatch, Tags and Watched Date on diary.csv.
 *
 * Films only — Letterboxd does not do television — so nothing here looks for
 * seasons, unlike every other reader in this file.
 *
 * Three things it carries that the streaming exports do not: the release
 * year, the star rating, and, in the diary, the date you actually watched
 * something rather than the date the row was created. A diary holds one row
 * per viewing, so a film watched three times arrives three times: the rows
 * are folded into one, keeping the most recent viewing, which is what
 * lastWatchedAt means here. Recording each of them would need somewhere to
 * put them, and there is no such table.
 */
export function readLetterboxd(
  content: string,
  kind: "watched" | "watchlist",
): HistoryRow[] {
  const records: Record<string, string>[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  });

  const seen = new Map<string, HistoryRow>();

  for (const row of records) {
    const title = (row["Name"] || "").trim();
    if (!title) continue;
    const key = fallbackIdentity({ title, mediaType: "Movie", year: Number(row["Year"]) || null });
    if (!key) continue;

    // "Watched Date" is the day it was seen; "Date" is the day the row was
    // written, which for watched.csv and ratings.csv is the only one there
    // is. A watchlist entry has not been watched at all, so it keeps neither.
    const watchedAt =
      kind === "watched"
        ? parseIsoDay(row["Watched Date"] || row["Date"] || "")
        : null;

    // Half to five stars, which this catalog holds out of ten.
    const stars = Number(row["Rating"]);
    const rating = stars >= 0.5 && stars <= 5 ? stars * 2 : null;
    const year = Number(row["Year"]);
    const uri = (row["Letterboxd URI"] || "").trim();

    const existing = seen.get(key);
    if (existing) {
      // Same film again: the diary's other viewings. Keep the latest date and
      // whichever of the rows carried a rating.
      if (
        watchedAt &&
        (!existing.lastWatchedAt || watchedAt.getTime() > existing.lastWatchedAt.getTime())
      ) {
        existing.lastWatchedAt = watchedAt;
      }
      if (existing.personalRating == null && rating != null) existing.personalRating = rating;
      continue;
    }

    seen.set(key, {
      title,
      searchTitle: normalizeTitle(title),
      // Letterboxd knows what you watched, never where — same position IMDb
      // leaves us in. A watchlist entry carries "" instead, the value this
      // catalog uses for "not watched anywhere yet".
      platform: kind === "watched" ? "Unknown" : "",
      mediaType: "Movie",
      status: kind === "watched" ? "Watched" : "To watch",
      lastWatchedAt: watchedAt,
      watchedSeasons: null,
      inWatchlist: kind === "watchlist",
      link: /^https?:\/\//.test(uri) ? uri : null,
      personalRating: rating,
      year: year >= 1870 && year <= 2200 ? year : null,
    });
  }

  return [...seen.values()];
}

/**
 * A Disney+ watchlist, as collected by public/disney-watchlist.js.
 *
 * Disney+ has no export of its own and no public API, so the columns are ours
 * rather than theirs: Title,Type,Link. Unlike the two history formats these
 * rows are things still to watch, so they carry no date and no platform —
 * "where" is only known once something has actually been watched somewhere
 * (see src/lib/platforms.ts, which states that invariant for the column).
 *
 * Season suffixes are stripped the same way as everywhere else: a watchlist
 * holding "Andor - Season 2" means the reader wants to watch Andor.
 */
export function readDisneyWatchlist(content: string): HistoryRow[] {
  const records: { Title: string; Type: string; Link: string }[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    // A watchlist scraped from a page can carry a stray short row; one bad
    // line should not cost the reader the whole import.
    relax_column_count: true,
  });

  // Keyed by normalized title so the same show listed twice (and a series
  // listed once per season) collapses into one entry.
  const seen = new Map<string, HistoryRow>();

  for (const row of records) {
    const rawTitle = row.Title?.trim();
    if (!rawTitle) continue;

    // The script reads the type from the title's own URL (/series/ or
    // /movies/), so it is trustworthy when present; the season keywords are
    // the fallback for a row that arrived without one.
    const declared = row.Type?.trim().toLowerCase();
    const mediaType =
      declared === "series" || declared === "movie"
        ? declared === "series"
          ? "Series"
          : "Movie"
        : looksLikeSeries(rawTitle)
          ? "Series"
          : "Movie";

    const title = mediaType === "Series" ? withoutSeason(rawTitle) || rawTitle : rawTitle;
    const key = fallbackIdentity({ title, mediaType });
    if (seen.has(key)) continue;

    const link = row.Link?.trim();
    seen.set(key, {
      title,
      searchTitle: normalizeTitle(title),
      platform: "",
      mediaType,
      status: "To watch",
      lastWatchedAt: null,
      watchedSeasons: null,
      inWatchlist: true,
      link: link && /^https?:\/\//i.test(link) ? link : null,
    });
  }

  return [...seen.values()];
}

/**
 * Key used to recognise a series as "already in the catalog".
 *
 * It goes through the name with the season stripped, because rows imported
 * earlier carried the season in the title ("Chicago Fire - Season 5"). Without
 * it, re-importing the export would add a fresh "Chicago Fire" alongside the
 * ten old rows.
 */
/**
 * A "YYYY-MM-DD" day as local midnight — the convention the app's own date
 * field uses (src/lib/date-input.ts), so a day imported and a day typed mean
 * the same instant. `new Date("2024-03-02")` would read it as UTC, which is
 * the previous evening for anyone west of Greenwich.
 */
function parseIsoDay(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function seriesKey(title: string, mediaType: string): string {
  if (mediaType !== "Series") return normalizeTitle(title);
  return normalizeTitle(withoutSeason(title) || title);
}
