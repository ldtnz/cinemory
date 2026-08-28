import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  seriesKey,
  readHistory,
  detectFormat,
  type HistoryRow,
} from "@/lib/history";

// Inserting does not call TMDB: it reads, de-duplicates and writes. The
// enrichment (posters and metadata) happens afterwards, in batches, through
// /api/import/enrich.
export const maxDuration = 60;

const MAX_BYTE = 8 * 1024 * 1024;

type FileOutcome = {
  file: string;
  format: string | null;
  read: number;
  alreadyPresent: number;
  added: number;
  /** Series already in the catalog whose watched seasons the export updated. */
  seasonsUpdated: number;
  error?: string;
};

/**
 * Incremental import of a Netflix or Prime Video history export.
 *
 * It only adds titles that are not there yet: de-duplication is on the
 * normalized title regardless of platform, so a movie already in the catalog
 * from Netflix does not come back when the Prime Video export is loaded too.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.getAll("file").filter((f): f is File => f instanceof File) ?? [];
  if (file.length === 0) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }

  // The existing catalog is held in memory: the normalized title for
  // de-duplication, and the seasons already recorded to tell whether the
  // export brings new ones.
  const existing = new Map(
    (
      await prisma.title.findMany({
        select: { id: true, title: true, mediaType: true, watchedSeasons: true },
      })
    ).map((t) => [seriesKey(t.title, t.mediaType), t]),
  );

  // Highest id before inserting: the starting point for the enrichment, which
  // therefore only works on the titles just added.
  const cursor = (await prisma.title.aggregate({ _max: { id: true } }))._max.id ?? 0;

  const outcomes: FileOutcome[] = [];
  const toInsert: HistoryRow[] = [];
  const toUpdate: { id: number; watchedSeasons: number }[] = [];

  for (const f of file) {
    if (f.size > MAX_BYTE) {
      outcomes.push({
        file: f.name,
        format: null,
        read: 0,
        alreadyPresent: 0,
        added: 0,
        seasonsUpdated: 0,
        error: "File too large (8 MB max).",
      });
      continue;
    }

    const content = await f.text();
    const format = detectFormat(content);
    if (!format) {
      outcomes.push({
        file: f.name,
        format: null,
        read: 0,
        alreadyPresent: 0,
        added: 0,
        seasonsUpdated: 0,
        error: "Unrecognized format: expected a Netflix or Prime Video export.",
      });
      continue;
    }

    let rows: HistoryRow[];
    try {
      rows = readHistory(content, format);
    } catch {
      outcomes.push({
        file: f.name,
        format,
        read: 0,
        alreadyPresent: 0,
        added: 0,
        seasonsUpdated: 0,
        error: "Could not read the CSV.",
      });
      continue;
    }

    let alreadyPresent = 0;
    let added = 0;
    let seasonsUpdated = 0;
    for (const row of rows) {
      // The map grows as it goes, so two files uploaded together do not
      // duplicano a vicenda.
      const key = seriesKey(row.title, row.mediaType);
      const found = existing.get(key);
      if (found) {
        alreadyPresent += 1;
        // The title was already there, but the export can carry watched
        // seasons that were missing before (or one more than last time).
        // Without this, re-importing would never update existing series.
        if (row.watchedSeasons != null && row.watchedSeasons > (found.watchedSeasons ?? 0)) {
          toUpdate.push({ id: found.id, watchedSeasons: row.watchedSeasons });
          found.watchedSeasons = row.watchedSeasons;
          seasonsUpdated += 1;
        }
        continue;
      }
      existing.set(key, {
        // Not inserted yet: this entry only exists to block duplicates inside the file.
        id: -1,
        title: row.title,
        mediaType: row.mediaType,
        watchedSeasons: row.watchedSeasons,
      });
      toInsert.push(row);
      added += 1;
    }

    outcomes.push({
      file: f.name,
      format,
      read: rows.length,
      alreadyPresent,
      added,
      seasonsUpdated,
    });
  }

  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    await prisma.title.createMany({ data: toInsert.slice(i, i + BATCH) });
  }

  for (const agg of toUpdate) {
    await prisma.title.update({
      where: { id: agg.id },
      data: { watchedSeasons: agg.watchedSeasons },
    });
  }

  return NextResponse.json({
    outcomes,
    added: toInsert.length,
    seasonsUpdated: toUpdate.length,
    cursor,
  });
}
