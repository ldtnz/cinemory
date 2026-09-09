import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { dismissRecommendation } from "@/lib/recommendations";

type Body = {
  tmdbId: number | null;
  title: string;
  mediaType: string;
};

/** "Not interested" on an AI recommendation: excludes it from what is shown
 *  from now on, and from every future generation prompt. */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await dismissRecommendation({
    tmdbId: typeof body.tmdbId === "number" ? body.tmdbId : null,
    title: body.title,
    mediaType: body.mediaType === "Series" ? "Series" : "Movie",
  });

  return NextResponse.json({ ok: true });
}
