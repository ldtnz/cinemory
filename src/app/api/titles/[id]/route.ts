import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidPlatform } from "@/lib/platforms";
import { dismissNewSeason } from "@/lib/season-check";
import { clampWatchedSeasons } from "@/lib/season-counts";
import { parseWatchedDate } from "@/lib/watched-date";

/**
 * The columns the grid does not carry, for one title.
 *
 * Only the synopsis so far: it is four lines in the "mark as watched" dialog
 * and several hundred characters on every row, so the catalog payload leaves
 * it behind (src/lib/catalog-title.ts) and the dialog asks for the one it is
 * about.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const title = await prisma.title.findUnique({ where: { id }, select: { overview: true } });
  if (!title) {
    return NextResponse.json({ error: "Title not found." }, { status: 404 });
  }

  return NextResponse.json(title);
}

/** Removes a title from the catalog (edit mode, enabled in settings). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const removed = await prisma.title.deleteMany({ where: { id } });
  if (removed.count === 0) {
    return NextResponse.json({ error: "Title not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted: id });
}

/**
 * Five edits, told apart by the body:
 *  - { markWatched: { platform } } moves a watchlist entry into the watched
 *    half, recording where it was finally watched.
 *  - { moveToWatchlist: true } is the way back: it drops the platform and the
 *    watched date, which is what "not watched yet" means here.
 *  - { editWatched: { platform, lastWatchedAt, watchedSeasons } } corrects an
 *    already-watched title from the edit dialog (edit mode). How many seasons
 *    exist is not among them: that is TMDB's answer, fetched automatically.
 *  - { watchedSeasons } updates a series' progress (the +/- controls in
 *    edit mode).
 *  - { dismissNewSeason: true } clears the "new season available" badge set
 *    by the automatic sweep in src/lib/season-check.ts.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        watchedSeasons?: number | null;
        markWatched?: { platform?: string; lastWatchedAt?: string };
        editWatched?: {
          platform?: string;
          lastWatchedAt?: string | null;
          watchedSeasons?: number | null;
        };
        moveToWatchlist?: boolean;
        dismissNewSeason?: boolean;
      }
    | null;

  if (body?.dismissNewSeason) {
    await dismissNewSeason(id);
    const title = await prisma.title.findUnique({ where: { id } });
    if (!title) {
      return NextResponse.json({ error: "Title not found." }, { status: 404 });
    }
    return NextResponse.json({ title });
  }

  if (body?.moveToWatchlist) {
    const updated = await prisma.title.updateMany({
      where: { id },
      // Cleared rather than kept: everything here reads a watchlist entry as
      // one that has not been watched anywhere, and a leftover date would
      // also sort it among things that have been.
      data: {
        inWatchlist: true,
        status: "To watch",
        platform: "",
        lastWatchedAt: null,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Title not found." }, { status: 404 });
    }
    const title = await prisma.title.findUnique({ where: { id } });
    return NextResponse.json({ title });
  }

  if (body?.markWatched) {
    const { platform, lastWatchedAt } = body.markWatched;
    if (!isValidPlatform(platform)) {
      return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
    }
    let watchedAt = new Date();
    if (lastWatchedAt) {
      const parsed = parseWatchedDate(lastWatchedAt);
      if (!parsed) {
        return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      }
      watchedAt = parsed;
    }
    // Applies to movies and series alike, unlike the seasons path below.
    const updated = await prisma.title.updateMany({
      where: { id },
      // inWatchlist and status are always written together — see
      // src/lib/watch-mode.ts.
      data: {
        inWatchlist: false,
        status: "Watched",
        platform,
        lastWatchedAt: watchedAt,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Title not found." }, { status: 404 });
    }
    const title = await prisma.title.findUnique({ where: { id } });
    return NextResponse.json({ title });
  }

  if (body?.editWatched) {
    const { platform, lastWatchedAt, watchedSeasons } = body.editWatched;
    if (!isValidPlatform(platform)) {
      return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
    }
    let watchedAt: Date | null = null;
    if (lastWatchedAt) {
      watchedAt = parseWatchedDate(lastWatchedAt);
      if (!watchedAt) {
        return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      }
    }

    // A watchlist entry has no watched date or real platform to correct —
    // that is what "mark as watched" is for.
    const current = await prisma.title.findUnique({
      where: { id },
      select: { mediaType: true, inWatchlist: true, watchedSeasons: true, totalSeasons: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Title not found." }, { status: 404 });
    }
    if (current.inWatchlist) {
      return NextResponse.json({ error: "Title is still on the watchlist." }, { status: 400 });
    }

    // Progress travels with the rest of the dialog rather than in a second
    // request, so one Save is one edit. A movie has none, and a body that left
    // it out changes nothing — which is what stops a platform edit clearing it.
    const seasons =
      current.mediaType === "Series" && watchedSeasons !== undefined
        ? { watchedSeasons: clampWatchedSeasons(watchedSeasons, current.totalSeasons) }
        : null;

    const title = await prisma.title.update({
      where: { id },
      data: { platform, lastWatchedAt: watchedAt, ...(seasons ?? {}) },
    });
    return NextResponse.json({ title });
  }

  const value = body?.watchedSeasons;
  if (value !== null && !Number.isInteger(value)) {
    return NextResponse.json({ error: "Invalid watchedSeasons value." }, { status: 400 });
  }

  const existing = await prisma.title.findUnique({
    where: { id },
    select: { mediaType: true, totalSeasons: true, watchedSeasons: true, inWatchlist: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Title not found." }, { status: 404 });
  }
  if (existing.mediaType !== "Series") {
    return NextResponse.json(
      { error: "Seasons only apply to series." },
      { status: 400 },
    );
  }
  // A watchlist entry has not been watched at all yet — nothing to record
  // partial progress on. The UI already hides the control; this rejects a
  // direct call too.
  if (existing.inWatchlist) {
    return NextResponse.json(
      { error: "Cannot set watched seasons for a title still on the watchlist." },
      { status: 400 },
    );
  }

  // Same rule as the dialog uses, from the same place: zero means "none
  // watched", and the ceiling is the known total.
  const watchedSeasons = clampWatchedSeasons(value, existing.totalSeasons);

  const title = await prisma.title.update({
    where: { id },
    data: { watchedSeasons },
    select: { id: true, watchedSeasons: true, totalSeasons: true },
  });

  return NextResponse.json({ title });
}
