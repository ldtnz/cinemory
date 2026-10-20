import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { fetchSeasonEpisodes, fetchSeasonSummary } from "@/lib/tmdb";

/**
 * What the episode picker lists for a series: ?id=<tmdbId> alone returns its
 * seasons, with ?season=<n> the episodes of that one season. Asked for one
 * season at a time because a long-running show has thousands of episodes and
 * only the season someone opens is ever read.
 */
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const tmdbId = Number(request.nextUrl.searchParams.get("id"));
  const seasonParam = request.nextUrl.searchParams.get("season");
  const season = seasonParam === null ? null : Number(seasonParam);
  if (!(tmdbId > 0) || (season !== null && !(Number.isInteger(season) && season > 0))) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }

  const data =
    season === null
      ? { seasons: await fetchSeasonSummary(tmdbId) }
      : { episodes: await fetchSeasonEpisodes(tmdbId, season) };
  if (Object.values(data)[0] === null) {
    return NextResponse.json({ error: "TMDB did not answer." }, { status: 502 });
  }
  // Short: what is "out" changes every week for a series still airing.
  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
