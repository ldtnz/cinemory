import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTmdbConfigured } from "@/lib/tmdb";
import {
  MISSING_TOTAL,
  SEASON_FILL_BATCH,
  fillMissingSeasonCounts,
} from "@/lib/season-check";

export const maxDuration = 60;

/**
 * Fills totalSeasons on series that still have it empty, on demand.
 *
 * The same work the automatic sweep does on its own (see
 * src/lib/season-check.ts) — this is the button for someone who does not want
 * to wait for the next page load to work through a backlog, and the progress
 * bar that comes with it. The filling itself is shared, so the two cannot
 * disagree about what a missing count is or how a no-answer is recorded.
 *
 * Progress is a cursor on the id, as with the import enrichment.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isTmdbConfigured()) {
    return NextResponse.json({ error: "TMDB is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { cursor?: number } | null;
  const cursor = Number.isFinite(body?.cursor) ? Number(body!.cursor) : 0;

  const { completed, unavailable, lastId, scanned } = await fillMissingSeasonCounts(cursor);

  const remaining = await prisma.title.count({
    where: { ...MISSING_TOTAL, id: { gt: lastId } },
  });

  return NextResponse.json({
    completed,
    unavailable,
    cursor: lastId,
    remaining,
    done: scanned < SEASON_FILL_BATCH,
  });
}

/** How many series still have no season count. */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const missing = await prisma.title.count({ where: MISSING_TOTAL });
  return NextResponse.json({ missing });
}
