import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { fetchTitleCredits } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const tmdbId = Number(request.nextUrl.searchParams.get("id"));
  const mediaType = request.nextUrl.searchParams.get("type");
  if (!(tmdbId > 0) || (mediaType !== "Movie" && mediaType !== "Series")) {
    return NextResponse.json({ error: "Invalid parameters." }, { status: 400 });
  }

  const credits = await fetchTitleCredits(tmdbId, mediaType);
  return NextResponse.json(credits, {
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
