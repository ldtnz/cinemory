import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidPlatform } from "@/lib/platforms";

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

  const eliminati = await prisma.title.deleteMany({ where: { id } });
  if (eliminati.count === 0) {
    return NextResponse.json({ error: "Title not found." }, { status: 404 });
  }

  return NextResponse.json({ eliminato: id });
}

/**
 * Three edits, told apart by the body:
 *  - { markWatched: { platform } } moves a watchlist entry into the watched
 *    half, recording where it was finally watched.
 *  - { editWatched: { platform, lastWatchedAt } } corrects the platform or
 *    date on a title that is already watched (edit mode).
 *  - { watchedSeasons } updates a series' progress (the +/- controls in
 *    edit mode).
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
        editWatched?: { platform?: string; lastWatchedAt?: string | null };
      }
    | null;

  if (body?.markWatched) {
    const { platform, lastWatchedAt } = body.markWatched;
    if (!isValidPlatform(platform)) {
      return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
    }
    let watchedAt = new Date();
    if (lastWatchedAt) {
      watchedAt = new Date(lastWatchedAt);
      if (isNaN(watchedAt.getTime())) {
        return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      }
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
    const { platform, lastWatchedAt } = body.editWatched;
    if (!isValidPlatform(platform)) {
      return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
    }
    let watchedAt: Date | null = null;
    if (lastWatchedAt) {
      watchedAt = new Date(lastWatchedAt);
      if (isNaN(watchedAt.getTime())) {
        return NextResponse.json({ error: "Invalid date." }, { status: 400 });
      }
    }
    // A watchlist entry has no watched date or real platform to correct —
    // that is what "mark as watched" is for.
    const updated = await prisma.title.updateMany({
      where: { id, inWatchlist: false },
      data: { platform, lastWatchedAt: watchedAt },
    });
    if (updated.count === 0) {
      const exists = await prisma.title.findUnique({ where: { id }, select: { id: true } });
      return NextResponse.json(
        { error: exists ? "Title is still on the watchlist." : "Title not found." },
        { status: exists ? 400 : 404 },
      );
    }
    const title = await prisma.title.findUnique({ where: { id } });
    return NextResponse.json({ title });
  }

  const value = body?.watchedSeasons;
  if (value !== null && !Number.isInteger(value)) {
    return NextResponse.json({ error: "Invalid watchedSeasons value." }, { status: 400 });
  }

  const existing = await prisma.title.findUnique({
    where: { id },
    select: { mediaType: true, totalSeasons: true, inWatchlist: true },
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

  // Zero means "none watched", i.e. nothing to display.
  // The ceiling is the known total: you cannot watch more seasons than
  // there are.
  let watchedSeasons: number | null = value ?? null;
  if (watchedSeasons !== null) {
    if (watchedSeasons < 0) watchedSeasons = 0;
    if (existing.totalSeasons != null && watchedSeasons > existing.totalSeasons) {
      watchedSeasons = existing.totalSeasons;
    }
    if (watchedSeasons === 0) watchedSeasons = null;
  }

  const title = await prisma.title.update({
    where: { id },
    data: { watchedSeasons },
    select: { id: true, watchedSeasons: true, totalSeasons: true },
  });

  return NextResponse.json({ title });
}
