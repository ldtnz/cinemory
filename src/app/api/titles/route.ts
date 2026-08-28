import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TmdbCandidate } from "@/lib/tmdb";

// Valid platforms: the same four used by the catalog filter.
const PIATTAFORME_VALIDE = ["Netflix", "Amazon Prime Video", "Disney+", "Cinema"];

type CorpoRichiesta = {
  candidate: TmdbCandidate;
  platform: string;
};

function normalize(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Creates a new catalog entry from a TMDB candidate picked by the user (used
 * by the "Add title" card when a search finds no match in the existing
 * catalog). */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as CorpoRichiesta | null;
  if (!body || !body.candidate || !body.candidate.title) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!PIATTAFORME_VALIDE.includes(body.platform)) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }

  const { candidate, platform } = body;
  const searchTitle = normalize(candidate.title);

  // No duplicates: same normalised name, or same work on TMDB (the user picked
  // that exact candidate, so the id is trustworthy). -1 is the conventional
  // value for titles flagged as "ignore" on the settings page, not a real
  // work, so it has to be excluded from the comparison.
  const existing = await prisma.title.findFirst({
    where: {
      OR: [
        { searchTitle },
        ...(candidate.tmdbId > 0
          ? [{ tmdbId: candidate.tmdbId, mediaType: candidate.mediaType }]
          : []),
      ],
    },
    select: { id: true, title: true, platform: true },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: `"${existing.title}" e' gia' in catalogo (${existing.platform}).`,
        existing,
      },
      { status: 409 },
    );
  }

  const title = await prisma.title.create({
    data: {
      title: candidate.title,
      searchTitle,
      platform,
      mediaType: candidate.mediaType,
      status: "Watched",
      lastWatchedAt: new Date(),
      tmdbId: candidate.tmdbId,
      posterUrl: candidate.posterUrl,
      backdropUrl: candidate.backdropUrl,
      overview: candidate.overview,
      tmdbRating: candidate.tmdbRating,
      year: candidate.year,
      genres: candidate.genres,
    },
  });

  return NextResponse.json({ title });
}
