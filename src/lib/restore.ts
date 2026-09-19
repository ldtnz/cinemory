// Reading back the JSON backup that /api/export writes.
//
// The export exists because the catalog is the only copy of years of watch
// history; a backup nothing can read is not a backup, which is what this
// closes. The rule is the same one the CSV import follows: titles that are
// not in the catalog are added, titles that are already there are left
// exactly as they are. Restoring into an empty database therefore brings
// everything back, and restoring into a live one can only add — never
// silently replace something newer with something older.

import { prisma } from "@/lib/prisma";
import { TitleIdentityIndex } from "@/lib/title-identity";
import { seriesKey } from "@/lib/history";
import { normalizeTitle } from "@/lib/title-key";

/** The version /api/export stamps on what it writes. */
export const BACKUP_VERSION = 1;

export type RestorableTitle = {
  title: string;
  searchTitle: string;
  platform: string;
  mediaType: string;
  status: string;
  lastWatchedAt: Date | null;
  totalSeasons: number | null;
  watchedSeasons: number | null;
  newSeasonAvailable: boolean;
  inWatchlist: boolean;
  link: string | null;
  tmdbId: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  tmdbRating: number | null;
  year: number | null;
  genres: string | null;
  personalRating: number | null;
  createdAt?: Date;
};

export type ParsedBackup =
  | { ok: true; rows: RestorableTitle[]; read: number; unreadable: number }
  | { ok: false; error: string };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  const n = asNumber(value);
  return n != null && Number.isInteger(n) ? n : null;
}

/**
 * A timestamp in the shape the export writes — `Date.toISOString()` — and
 * nothing else.
 *
 * The constructor alone would not do: V8 reads "some time in 2021" as the
 * first of January 2021, so a mangled field would be restored as a confident
 * wrong date instead of as no date. Same trap the MCP tools guard against in
 * parseWatchedDate; here the input is our own output, so the shape can be
 * pinned exactly.
 */
function asDate(value: unknown): Date | null {
  const text = asString(value)?.trim();
  if (!text || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    return null;
  }
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Validates the envelope and every row in it, without touching the database.
 *
 * The only thing a row cannot be restored without is a title. The other three
 * non-null columns fall back rather than costing the row: `platform` is
 * stored as "" for a watchlist entry and, in older catalogs, for a watched
 * title whose service was never recorded — so an empty one is real data, not
 * a broken row. Rows that genuinely carry nothing are counted rather than
 * aborting the restore: one corrupted line out of two thousand should not
 * cost someone the other 1,999.
 */
export function parseBackup(payload: unknown): ParsedBackup {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, error: "That file is not a Cinemory backup." };
  }
  const envelope = payload as { version?: unknown; titles?: unknown };
  if (asNumber(envelope.version) !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `Unsupported backup version: this app reads version ${BACKUP_VERSION}.`,
    };
  }
  if (!Array.isArray(envelope.titles)) {
    return { ok: false, error: "That file is not a Cinemory backup." };
  }

  const rows: RestorableTitle[] = [];
  let unreadable = 0;

  for (const entry of envelope.titles) {
    if (typeof entry !== "object" || entry === null) {
      unreadable += 1;
      continue;
    }
    const row = entry as Record<string, unknown>;
    const title = asString(row.title);
    if (!title) {
      unreadable += 1;
      continue;
    }
    const inWatchlist = row.inWatchlist === true;
    const platform = typeof row.platform === "string" ? row.platform : "";
    const mediaType = asString(row.mediaType) ?? "Movie";
    // Which half of the catalog the title lands in. Taken from the row, and
    // otherwise from the one other field that says the same thing.
    const status = asString(row.status) ?? (inWatchlist ? "To watch" : "Watched");

    const createdAt = asDate(row.createdAt);
    rows.push({
      title,
      // Recomputed rather than trusted: it is derived data, and a backup
      // written before the normalization changed would otherwise restore a
      // title that search can no longer find.
      searchTitle: normalizeTitle(title),
      platform,
      mediaType,
      status,
      lastWatchedAt: asDate(row.lastWatchedAt),
      totalSeasons: asInteger(row.totalSeasons),
      watchedSeasons: asInteger(row.watchedSeasons),
      newSeasonAvailable: row.newSeasonAvailable === true,
      inWatchlist,
      link: asString(row.link),
      tmdbId: asInteger(row.tmdbId),
      posterUrl: asString(row.posterUrl),
      backdropUrl: asString(row.backdropUrl),
      overview: asString(row.overview),
      tmdbRating: asNumber(row.tmdbRating),
      year: asInteger(row.year),
      genres: asString(row.genres),
      personalRating: asNumber(row.personalRating),
      // Worth keeping: it is when the title entered the catalog, which a
      // restore should not reset to today.
      ...(createdAt ? { createdAt } : {}),
    });
  }

  return { ok: true, rows, read: envelope.titles.length, unreadable };
}

export type RestoreReport = {
  read: number;
  added: number;
  alreadyPresent: number;
  unreadable: number;
};

/**
 * Inserts the rows that are not in the catalog yet.
 *
 * Uses the shared identity rule, with season suffixes normalized for old
 * backups. Accepted rows join the index so repeated entries stay idempotent.
 */
export async function restoreTitles(
  rows: RestorableTitle[],
  read: number,
  unreadable: number,
): Promise<RestoreReport> {
  const present = new TitleIdentityIndex(
    (await prisma.title.findMany({ select: { title: true, mediaType: true, tmdbId: true, year: true } }))
      .map((t) => ({ ...t, title: seriesKey(t.title, t.mediaType) })),
  );

  const toInsert: RestorableTitle[] = [];
  let alreadyPresent = 0;
  for (const row of rows) {
    const identity = { ...row, title: seriesKey(row.title, row.mediaType) };
    if (present.has(identity)) {
      alreadyPresent += 1;
      continue;
    }
    present.add(identity);
    toInsert.push(row);
  }

  // Same batch size as the CSV import: a single createMany of several
  // thousand rows is one statement too large for the libSQL endpoint.
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await prisma.title.createMany({ data: toInsert.slice(i, i + BATCH) });
  }

  return { read, added: toInsert.length, alreadyPresent, unreadable };
}
