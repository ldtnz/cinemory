/**
 * Series that sit in the catalog split into one row per season.
 *
 * The Prime Video export lists every season as its own entry ("Chicago Fire -
 * Season 5") and the old import kept them apart: ten rows for a single show.
 * With seasons replacing episode counts that no longer makes sense, so they
 * get merged. Shared between the route that merges them and the settings page,
 * which shows the count.
 */
import { prisma } from "@/lib/prisma";
import { normalizeTitle, withoutSeason } from "@/lib/history";

export type SeriesGroup = {
  name: string;
  rows: {
    id: number;
    title: string;
    watchedSeasons: number | null;
    posterUrl: string | null;
    lastWatchedAt: Date | null;
  }[];
};

export async function groupsToMerge(): Promise<SeriesGroup[]> {
  const series = await prisma.title.findMany({
    where: { mediaType: "Series" },
    select: {
      id: true,
      title: true,
      watchedSeasons: true,
      posterUrl: true,
      lastWatchedAt: true,
    },
    orderBy: { id: "asc" },
  });

  const byName = new Map<string, SeriesGroup>();
  for (const t of series) {
    const name = withoutSeason(t.title) || t.title;
    const key = normalizeTitle(name);
    if (!byName.has(key)) byName.set(key, { name, rows: [] });
    byName.get(key)!.rows.push(t);
  }

  // Groups worth fixing: those with several rows to fold together, but also
  // series left on a single row whose name is still dirty ("Dexter Season 1"),
  // since that is what shows on the poster.
  return [...byName.values()].filter(
    (g) => g.rows.length > 1 || g.rows[0].title !== g.name,
  );
}

export type MergeSummary = {
  /** Series to fix: to be merged, or just renamed. */
  series: number;
  /** Rows that merging the duplicates will delete. */
  extraRows: number;
  examples: { name: string; rows: number }[];
};

export async function mergeSummary(): Promise<MergeSummary> {
  const g = await groupsToMerge();
  return {
    series: g.length,
    extraRows: g.reduce((a, x) => a + x.rows.length - 1, 0),
    examples: [...g]
      .sort((a, b) => b.rows.length - a.rows.length)
      .slice(0, 3)
      .map((x) => ({ name: x.name, rows: x.rows.length })),
  };
}
