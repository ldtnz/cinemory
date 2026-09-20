import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { semanticSearch } from "@/lib/semantic-search";

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { query?: string; mode?: string } | null;
  const query = body?.query?.trim().slice(0, 200);
  if (!query) return NextResponse.json({ error: "Missing query." }, { status: 400 });

  const inWatchlist = body?.mode === "watchlist";
  const titles = await prisma.title.findMany({
    where: { inWatchlist },
    select: {
      id: true,
      title: true,
      searchTitle: true,
      overview: true,
      genres: true,
      mediaType: true,
      platform: true,
      year: true,
      lastWatchedAt: true,
    },
  });
  const matches = semanticSearch(titles, query);
  return NextResponse.json({ ids: matches.map((match) => match.id) });
}
