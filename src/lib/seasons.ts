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
import { TitleIdentityIndex, tmdbIdentity, type TitleIdentity } from "@/lib/title-identity";
import { withoutSeason } from "@/lib/history";

// Re-exported so the modules that already import "seasons" keep working; the
// rule itself lives apart because the browser needs it too.
export { NO_SEASON_COUNT, hasSeasonTotal, clampWatchedSeasons } from "@/lib/season-counts";

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
      tmdbId: true,
      year: true,
      watchedSeasons: true,
      posterUrl: true,
      lastWatchedAt: true,
    },
    orderBy: { id: "asc" },
  });

  const groups: SeriesGroup[] = [];
  const identities = new TitleIdentityIndex<TitleIdentity & { group: SeriesGroup }>();
  // Index confirmed works first, so an unresolved row can never bridge two
  // different TMDB identities just because their names happen to match.
  const ordered = [...series].sort((a, b) =>
    Number(Boolean(tmdbIdentity({ ...b, mediaType: "Series" }))) -
    Number(Boolean(tmdbIdentity({ ...a, mediaType: "Series" }))),
  );
  for (const t of ordered) {
    const name = withoutSeason(t.title) || t.title;
    const identity = { ...t, title: name, mediaType: "Series" };
    const found = identities.find(identity);
    if (found) {
      found.group.rows.push(t);
    } else {
      const group = { name, rows: [t] };
      groups.push(group);
      identities.add({ ...identity, group });
    }
  }

  // Groups worth fixing: those with several rows to fold together, but also
  // series left on a single row whose name is still dirty ("Dexter Season 1"),
  // since that is what shows on the poster.
  return groups.filter(
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
