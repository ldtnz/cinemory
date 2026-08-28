import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seasonNumber, normalizeTitle } from "@/lib/history";
import { groupsToMerge } from "@/lib/seasons";

export const maxDuration = 60;

// The count shown on the settings page lives in src/lib/seasons.ts, so the
// page and this route look at the same groups.

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const toMerge = await groupsToMerge();
  let merged = 0;
  let removed = 0;

  for (const g of toMerge) {
    // Keep the row that has a poster (the useful one to look at); on a tie,
    // the oldest, so the title keeps its original id.
    const primary =
      g.rows.find((r) => r.posterUrl) ?? g.rows[0];

    // Watched seasons are the distinct ones named by the titles in the group,
    // plus whatever was already recorded: merging "Season 1".."Season 10"
    // gives 10, not 1.
    const seasonNumbers = new Set<number>();
    for (const r of g.rows) {
      const n = seasonNumber(r.title);
      if (n) seasonNumbers.add(n);
    }
    const fromCounts = Math.max(0, ...g.rows.map((r) => r.watchedSeasons ?? 0));
    const watchedSeasons = Math.max(seasonNumbers.size, fromCounts) || null;

    const date = g.rows
      .map((r) => r.lastWatchedAt)
      .filter((d): d is Date => d != null)
      .map((d) => d.getTime());
    const lastWatchedAt = date.length > 0 ? new Date(Math.max(...date)) : null;

    await prisma.title.update({
      where: { id: primary.id },
      data: {
        title: g.name,
        searchTitle: normalizeTitle(g.name),
        watchedSeasons,
        lastWatchedAt,
      },
    });

    const altri = g.rows.filter((r) => r.id !== primary.id).map((r) => r.id);
    if (altri.length > 0) {
      const res = await prisma.title.deleteMany({ where: { id: { in: altri } } });
      removed += res.count;
    }
    merged += 1;
  }

  return NextResponse.json({ merged, removed });
}
