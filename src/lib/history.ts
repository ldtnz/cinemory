/**
 * Parsing of Netflix and Amazon Prime Video watch-history exports.
 *
 * Shared between the initial seed (prisma/seed.ts, which wipes and refills the
 * catalog) and the incremental import on the settings page (which only adds
 * what is missing). The grouping heuristics are delicate, and keeping them in
 * one place stops the two paths from drifting apart.
 */
import { parse } from "csv-parse/sync";

/** Normalizes a title for search and de-duplication (lowercase, no accents). */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

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
};

export type Format = "netflix" | "amazon";

// Netflix and Prime Video localise the exported titles to the account's own
// language, so the season keywords are matched in English and in Italian (the
// language this catalog was first built against). Add your own if your export
// uses different words.
const SERIES_KEYWORDS = /\b(Season|Episode|Miniseries|Part|Stagione|Episodio|Miniserie|Parte)\b/i;

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
 * is neither of the two expected formats.
 */
export function detectFormat(content: string): Format | null {
  const header = content.slice(0, 500).toLowerCase();
  if (header.includes("global title identifier") || header.includes("date watched")) {
    return "amazon";
  }
  // Netflix exports just two columns: Title,Date
  if (/^﻿?"?title"?\s*,\s*"?date"?\s*$/im.test(header.split("\n")[0] ?? "")) {
    return "netflix";
  }
  return null;
}

export function readHistory(content: string, format: Format): HistoryRow[] {
  return format === "netflix" ? readNetflix(content) : readAmazon(content);
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
      if (occursOften || SERIES_KEYWORDS.test(rawTitle)) {
        base = baseCandidate;
        isSeries = true;
      }
    }

    const key = normalizeTitle(base);
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
    const key = mediaType === "Series" ? normalizeTitle(title) : path || normalizeTitle(title);

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
 * Key used to recognise a series as "already in the catalog".
 *
 * It goes through the name with the season stripped, because rows imported
 * earlier carried the season in the title ("Chicago Fire - Season 5"). Without
 * it, re-importing the export would add a fresh "Chicago Fire" alongside the
 * ten old rows.
 */
export function seriesKey(title: string, mediaType: string): string {
  if (mediaType !== "Series") return normalizeTitle(title);
  return normalizeTitle(withoutSeason(title) || title);
}
