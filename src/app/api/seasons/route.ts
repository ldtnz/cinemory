import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { totalSeasonsFromTmdb, isTmdbConfigured } from "@/lib/tmdb";

export const maxDuration = 60;

// One TMDB request per series: the batch stays small to fit inside the
// serverless duration limit.
const BATCH_SIZE = 25;

/**
 * Fills totalSeasons on series that still have it empty.
 *
 * This is for an existing catalog: series imported before this feature have a
 * tmdbId but no season count, which the TMDB search does not return. As with
 * the import enrichment, progress is a cursor on the id: series TMDB cannot
 * count are left empty without
 * essere ritentate in eterno.
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
  for (const s of series) {
    const totalCount = await totalSeasonsFromTmdb(s.tmdbId!).catch(() => null);
    if (totalCount == null) continue;
    await prisma.title.update({ where: { id: s.id }, data: { totalSeasons: totalCount } });
    completed += 1;
  }

  const nextCursor = series.length > 0 ? series[series.length - 1].id : cursor;
  const remaining = await prisma.title.count({
    where: { ...filter, id: { gt: nextCursor } },
  });

  return NextResponse.json({
    completed,
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
