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
import { isTmdbConfigured, lookupTotalSeasons, totalSeasonsFromTmdb } from "@/lib/tmdb";
import { NO_SEASON_COUNT } from "@/lib/season-counts";

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

async function releaseSeasonCheckLock(sweptAll: boolean): Promise<void> {
  // lastSeasonCheckAt is stamped here, on release, not at claim time — a run
  // that crashes partway through leaves it unset, so the next trigger tries
  // again instead of waiting out the full interval for a sweep that never
  // finished. And only when the full sweep really ran: filling in a missing
  // count happens on any page load, and stamping for that would push the
  // weekly re-check out of reach forever.
  await prisma.settings
    .update({
      where: { id: 1 },
      data: {
        seasonCheckLockedAt: null,
        ...(sweptAll ? { lastSeasonCheckAt: new Date() } : {}),
      },
    })
    .catch(() => {});
}

/** One TMDB request per series, so a batch stays inside the duration limit. */
export const SEASON_FILL_BATCH = 25;

/** Series that have never been asked how many seasons they have. */
export const MISSING_TOTAL: { mediaType: "Series"; totalSeasons: null; tmdbId: { gt: number } } = {
  mediaType: "Series",
  totalSeasons: null,
  tmdbId: { gt: 0 },
};

/**
 * Fills totalSeasons on series that have never been asked.
 *
 * A series TMDB has no answer for is written as NO_SEASON_COUNT rather than
 * left empty, or the next run would pick it up again, find the same nothing,
 * and leave it again — forever. A request that merely failed to get through
 * is left alone, because that one really should be retried.
 */
export async function fillMissingSeasonCounts(
  cursor = 0,
  take = SEASON_FILL_BATCH,
): Promise<{ completed: number; unavailable: number; lastId: number; scanned: number }> {
  const series = await prisma.title.findMany({
    where: { ...MISSING_TOTAL, id: { gt: cursor } },
    select: { id: true, tmdbId: true },
    orderBy: { id: "asc" },
    take,
  });

  let completed = 0;
  let unavailable = 0;
  for (const s of series) {
    const found = await lookupTotalSeasons(s.tmdbId as number).catch(
      () => ({ status: "failed" }) as const,
    );
    if (found.status === "failed") continue;
    await prisma.title.update({
      where: { id: s.id },
      data: { totalSeasons: found.status === "none" ? NO_SEASON_COUNT : found.totalSeasons },
    });
    if (found.status === "none") unavailable += 1;
    else completed += 1;
  }

  return {
    completed,
    unavailable,
    lastId: series.length > 0 ? series[series.length - 1].id : cursor,
    scanned: series.length,
  };
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
    where: { mediaType: "Series", tmdbId: { gt: 0 }, totalSeasons: { gt: 0 } },
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
    const sweepDue = !row || canCheckNow(row.lastSeasonCheckAt);

    // Two different jobs behind one trigger. Asking whether a season has been
    // added since is a request per series, so it waits out the interval.
    // Asking how many a series has when nobody ever has is not something to
    // make someone wait a week for — the count is supposed to be there — and
    // it touches only the few that are missing, usually none at all.
    const missing = await prisma.title.count({ where: MISSING_TOTAL });
    if (!sweepDue && missing === 0) return;

    const claimed = await claimSeasonCheckLock().catch(() => false);
    if (!claimed) return; // another trigger already has this
    try {
      // A backlog is worked through a batch per load rather than all at once,
      // so no single request carries the whole thing.
      if (missing > 0) await fillMissingSeasonCounts();
      if (sweepDue) await checkAllSeriesForNewSeasons();
    } catch (err) {
      console.error("Automatic season check failed:", err);
    } finally {
      await releaseSeasonCheckLock(sweepDue);
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
