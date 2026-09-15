import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupTotalSeasons, isTmdbConfigured } from "@/lib/tmdb";
import { NO_SEASON_COUNT } from "@/lib/seasons";

export const maxDuration = 60;

// One TMDB request per series: the batch stays small to fit inside the
// serverless duration limit.
const BATCH_SIZE = 25;

/**
 * Fills totalSeasons on series that still have it empty.
 *
 * This is for an existing catalog: series imported before this feature have a
 * tmdbId but no season count, which the TMDB search does not return. As with
 * the import enrichment, progress is a cursor on the id.
 *
 * A series TMDB has no answer for is written as NO_SEASON_COUNT rather than
 * left empty. Leaving it empty is what "still has it empty" means, so the
 * next run picked it up again, found the same nothing, and left it again:
 * the count never reached zero however many times the button was pressed.
 * A request that merely failed to get through is still left alone — that one
 * really should be retried.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isTmdbConfigured()) {
    return NextResponse.json({ error: "TMDB is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { cursor?: number } | null;
  const cursor = Number.isFinite(body?.cursor) ? Number(body!.cursor) : 0;

  const filter = {
    mediaType: "Series",
    totalSeasons: null,
    tmdbId: { gt: 0 },
  } as const;

  const series = await prisma.title.findMany({
    where: { ...filter, id: { gt: cursor } },
    select: { id: true, tmdbId: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  let completed = 0;
  let unavailable = 0;
  for (const s of series) {
    const found = await lookupTotalSeasons(s.tmdbId!).catch(() => ({ status: "failed" }) as const);
    if (found.status === "failed") continue;
    if (found.status === "none") {
      await prisma.title.update({
        where: { id: s.id },
        data: { totalSeasons: NO_SEASON_COUNT },
      });
      unavailable += 1;
      continue;
    }
    await prisma.title.update({
      where: { id: s.id },
      data: { totalSeasons: found.totalSeasons },
    });
    completed += 1;
  }

  const nextCursor = series.length > 0 ? series[series.length - 1].id : cursor;
  const remaining = await prisma.title.count({
    where: { ...filter, id: { gt: nextCursor } },
  });

  return NextResponse.json({
    completed,
    unavailable,
    cursor: nextCursor,
    remaining,
    done: series.length < BATCH_SIZE,
  });
}

/** How many series still have no season count. */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const missing = await prisma.title.count({
    where: { mediaType: "Series", totalSeasons: null, tmdbId: { gt: 0 } },
  });
  return NextResponse.json({ missing });
}
