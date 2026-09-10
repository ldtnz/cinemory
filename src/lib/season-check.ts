// Automatic "is there a new season out?" sweep over every series already
// matched to TMDB. Fully hands-off: nudged from wherever the catalog
// changes hands with the user (the home page on every load, and right after
// a title is added — see ensureFreshSeasonCheckInBackground's call sites)
// rather than from a settings toggle, but the sweep itself only actually
// runs at most once every SEASON_CHECK_INTERVAL_DAYS, gated by a
// Settings-backed lock — the same shape src/lib/recommendations.ts already
// uses for its own automatic refresh.
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { isTmdbConfigured, totalSeasonsFromTmdb } from "@/lib/tmdb";

export const SEASON_CHECK_INTERVAL_DAYS = 7;
// A full sweep touches every series in the catalog, one TMDB request each —
// longer than the recommendations lock needs, so a slow run is not mistaken
// for an abandoned one and re-claimed out from under itself.
const LOCK_STALE_MINUTES = 30;

function canCheckNow(lastCheckedAt: Date | null): boolean {
  if (!lastCheckedAt) return true;
  const next = new Date(
    lastCheckedAt.getTime() + SEASON_CHECK_INTERVAL_DAYS * 24 * 60 * 60 * 1000,
  );
  return Date.now() >= next.getTime();
}

async function claimSeasonCheckLock(): Promise<boolean> {
  await getSettings(); // ensures the singleton row exists before the claim
  const staleBefore = new Date(Date.now() - LOCK_STALE_MINUTES * 60 * 1000);
  const result = await prisma.settings.updateMany({
    where: {
      id: 1,
      OR: [{ seasonCheckLockedAt: null }, { seasonCheckLockedAt: { lt: staleBefore } }],
    },
    data: { seasonCheckLockedAt: new Date() },
  });
  return result.count === 1;
}

async function releaseSeasonCheckLock(): Promise<void> {
  // lastSeasonCheckAt is stamped here, on release, not at claim time — a run
  // that crashes partway through leaves it unset, so the next trigger tries
  // again instead of waiting out the full interval for a sweep that never
  // finished.
  await prisma.settings
    .update({
      where: { id: 1 },
      data: { seasonCheckLockedAt: null, lastSeasonCheckAt: new Date() },
    })
    .catch(() => {});
}

/**
 * Re-checks every series already matched to TMDB, sequentially — a personal
 * catalog's series are few enough that this is cheap, and nothing is waiting
 * on it. Any series whose TMDB season count is now higher than what's
 * stored gets both fields updated at once: totalSeasons so "x of y seasons"
 * stays correct, newSeasonAvailable so the card can flag it without a
 * second pass over the same data.
 */
export async function checkAllSeriesForNewSeasons(): Promise<void> {
  const series = await prisma.title.findMany({
    where: { mediaType: "Series", tmdbId: { gt: 0 }, totalSeasons: { not: null } },
    select: { id: true, tmdbId: true, totalSeasons: true },
  });

  for (const s of series) {
    const current = await totalSeasonsFromTmdb(s.tmdbId as number);
    if (current != null && s.totalSeasons != null && current > s.totalSeasons) {
      await prisma.title.update({
        where: { id: s.id },
        data: { totalSeasons: current, newSeasonAvailable: true },
      });
    }
  }
}

/**
 * Schedules a sweep to run after the current response is sent (next/server's
 * after(), same as the recommendations refresh), if one is actually due —
 * the interval and lock checks happen inside the deferred callback, so
 * calling this never costs the triggering request an extra query.
 */
export function ensureFreshSeasonCheckInBackground(): void {
  if (!isTmdbConfigured()) return;

  after(async () => {
    await getSettings();
    const row = await prisma.settings.findUnique({
      where: { id: 1 },
      select: { lastSeasonCheckAt: true },
    });
    if (row && !canCheckNow(row.lastSeasonCheckAt)) return;

    const claimed = await claimSeasonCheckLock().catch(() => false);
    if (!claimed) return; // another trigger already has this
    try {
      await checkAllSeriesForNewSeasons();
    } catch (err) {
      console.error("Automatic season check failed:", err);
    } finally {
      await releaseSeasonCheckLock();
    }
  });
}

/** Clears the flag once the user has seen it — the card's badge calls this. */
export async function dismissNewSeason(titleId: number): Promise<void> {
  await prisma.title.update({
    where: { id: titleId },
    data: { newSeasonAvailable: false },
  });
}
