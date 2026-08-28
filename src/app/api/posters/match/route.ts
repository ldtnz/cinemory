import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TmdbCandidate } from "@/lib/tmdb";

type CorpoRichiesta = {
  id: number;
  candidate: TmdbCandidate;
};

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CorpoRichiesta | null;
  if (!body || typeof body.id !== "number" || !body.candidate) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { id, candidate } = body;

  await prisma.title.update({
    where: { id },
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

  return NextResponse.json({ ok: true });
}
