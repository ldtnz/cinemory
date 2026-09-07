import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { getTrailerKey } from "@/lib/tmdb";

// Looked up on demand (unlike the AI recommendations, which fetch it once at
// generation time) — the catalog can hold thousands of titles, so there is
// no reasonable "generate ahead of time" moment for this one.
export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const tmdbId = Number(request.nextUrl.searchParams.get("tmdbId"));
  const mediaType = request.nextUrl.searchParams.get("mediaType");
  if (!(tmdbId > 0) || (mediaType !== "Movie" && mediaType !== "Series")) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }

  const trailerKey = await getTrailerKey(tmdbId, mediaType);
  return NextResponse.json({ trailerKey });
}
