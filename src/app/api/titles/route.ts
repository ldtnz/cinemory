import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TmdbCandidate } from "@/lib/tmdb";
import { normalizeTitle } from "@/lib/title-key";

// Valid platforms: the same four used by the catalog filter.
const PIATTAFORME_VALIDE = ["Netflix", "Amazon Prime Video", "Disney+", "Cinema"];

type CorpoRichiesta = {
  candidate: TmdbCandidate;
  platform: string;
  /** Adds it as "to watch" instead of "watched": no platform yet, since the
   *  point is that it has not been watched anywhere. */
  watchlist?: boolean;
};

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
  const watchlist = body.watchlist === true;
  if (!watchlist && !PIATTAFORME_VALIDE.includes(body.platform)) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }

  const { candidate } = body;
  // Watchlist entries have no platform yet — it is only known once it has
  // actually been watched somewhere.
  const platform = watchlist ? "" : body.platform;
  const searchTitle = normalizeTitle(candidate.title);

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
        error: existing.platform
          ? `"${existing.title}" is already in the catalog (${existing.platform}).`
          : `"${existing.title}" is already on your watchlist.`,
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
      // inWatchlist is what every query filters on; status mirrors it for
      // readability and is written together with it, never separately.
      status: watchlist ? "To watch" : "Watched",
      inWatchlist: watchlist,
      lastWatchedAt: watchlist ? null : new Date(),
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
