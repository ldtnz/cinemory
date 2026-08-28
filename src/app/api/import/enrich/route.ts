import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findBestTmdbMatch, isTmdbConfigured } from "@/lib/tmdb";

export const maxDuration = 60;

// Titles per call: kept low because each one can cost up to four TMDB
// requests. The client keeps calling until it is done,
// mostrando l'avanzamento.
const BATCH_SIZE = 15;

/**
 * Fills in the TMDB data (poster, year, rating, genres) for the titles that
 * were just imported. It works one batch at a time to stay inside the
 * serverless duration limit.
 *
 * Progress is a cursor on the id rather than a marker on the record: titles
 * TMDB does not recognise are left untouched and end up in the list of posters
 * to link by hand, without the client loop retrying them forever.
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

  const titles = await prisma.title.findMany({
    where: { tmdbId: null, id: { gt: cursor } },
    select: { id: true, title: true, mediaType: true },
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
  });

  let enriched = 0;
  let unmatched = 0;

  for (const t of titles) {
    const candidate = await findBestTmdbMatch(t.title, t.mediaType).catch(() => null);
    if (!candidate) {
      unmatched += 1;
      continue;
    }
    await prisma.title.update({
      where: { id: t.id },
      data: {
        tmdbId: candidate.tmdbId,
        posterUrl: candidate.posterUrl,
        backdropUrl: candidate.backdropUrl,
        overview: candidate.overview,
        tmdbRating: candidate.tmdbRating,
        year: candidate.year,
        genres: candidate.genres,
      },
    });
    enriched += 1;
  }

  const nextCursor = titles.length > 0 ? titles[titles.length - 1].id : cursor;
  const remaining = await prisma.title.count({
    where: { tmdbId: null, id: { gt: nextCursor } },
  });

  return NextResponse.json({
    enriched,
    unmatched,
    cursor: nextCursor,
    remaining,
    done: titles.length < BATCH_SIZE,
  });
}
