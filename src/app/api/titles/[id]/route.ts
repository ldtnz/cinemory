import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

/** Updates the watched seasons of a series (the +/- controls in edit mode). */
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
    | { watchedSeasons?: number | null }
    | null;
  const value = body?.watchedSeasons;
  if (value !== null && !Number.isInteger(value)) {
    return NextResponse.json({ error: "Invalid watchedSeasons value." }, { status: 400 });
  }

  const existing = await prisma.title.findUnique({
    where: { id },
    select: { mediaType: true, totalSeasons: true },
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

  // Zero means "none watched", i.e. nothing to display.
  // The ceiling is the known total: you cannot watch more seasons than
  // ne esistano.
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
