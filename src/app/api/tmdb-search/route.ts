import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { searchTmdb } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q") ?? "";
  // "perType" lets the watchlist discovery grid ask for a fuller set than the
  // short list the add-title modal shows. Clamped so it can't be abused.
  const requested = Number(request.nextUrl.searchParams.get("perType"));
  const perType = requested > 0 ? Math.min(requested, 20) : undefined;
  const results = await searchTmdb(query, perType);
  return NextResponse.json({ results });
}
