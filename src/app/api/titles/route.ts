import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TmdbCandidate } from "@/lib/tmdb";
import { duplicateTitleWhere, TitleIdentityIndex } from "@/lib/title-identity";
import { normalizeTitle } from "@/lib/title-key";
import { parseWatchedDate } from "@/lib/watched-date";
import { isValidPlatform } from "@/lib/platforms";
import { ensureFreshSeasonCheckInBackground } from "@/lib/season-check";

// ensureFreshSeasonCheckInBackground's after() job (one TMDB call per series
// in the catalog) shares this request's execution budget even though it
// runs after the response is sent — the same wall the import routes hit.
export const maxDuration = 60;

type RequestBody = {
  candidate: TmdbCandidate;
  platform: string;
  /** Adds it as "to watch" instead of "watched": no platform yet, since the
   *  point is that it has not been watched anywhere. */
  watchlist?: boolean;
  /** When it was actually watched — defaults to now when omitted. Ignored
   *  for a watchlist entry, which has no watched date yet. */
  lastWatchedAt?: string;
};

/** Creates a new catalog entry from a TMDB candidate picked by the user (used
 * by the "Add title" card when a search finds no match in the existing
 * catalog). */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as RequestBody | null;
  if (!body || !body.candidate || !body.candidate.title) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const watchlist = body.watchlist === true;
  if (!watchlist && !isValidPlatform(body.platform)) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }

  let watchedAt = new Date();
  if (!watchlist && body.lastWatchedAt) {
    // Strictly: the isNaN check this replaces caught "hello" but not
    // "some time in 2021", which V8 reads as the first of January 2021 —
    // a wrong date that looks like a fact ever after.
    const parsed = parseWatchedDate(body.lastWatchedAt);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid date." }, { status: 400 });
    }
    watchedAt = parsed;
  }

  const { candidate } = body;
  // Watchlist entries have no platform yet — it is only known once it has
  // actually been watched somewhere.
  const platform = watchlist ? "" : body.platform;
  const searchTitle = normalizeTitle(candidate.title);

  const matches = await prisma.title.findMany({
    where: duplicateTitleWhere(candidate),
    select: { id: true, title: true, platform: true, mediaType: true, tmdbId: true, year: true },
  });
  const existing = new TitleIdentityIndex(matches).find(candidate);
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
      lastWatchedAt: watchlist ? null : watchedAt,
      tmdbId: candidate.tmdbId,
      posterUrl: candidate.posterUrl,
      backdropUrl: candidate.backdropUrl,
      overview: candidate.overview,
      tmdbRating: candidate.tmdbRating,
      year: candidate.year,
      genres: candidate.genres,
    },
  });

  // Piggybacks on every add as one of the moments that nudges the automatic
  // season-check sweep — see ensureFreshSeasonCheckInBackground's own doc
  // comment for why this never costs the request anything: it's a no-op
  // unless a sweep is actually due.
  ensureFreshSeasonCheckInBackground();

  return NextResponse.json({ title });
}
