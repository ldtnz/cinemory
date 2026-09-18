import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { POSTER_IGNORED } from "@/lib/posters";

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: number } | null;
  if (!body || typeof body.id !== "number") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Searched by hand and no match chosen: it no longer shows up among the
  // "missing" ones to review (see src/lib/posters.ts).
  await prisma.title.update({
    where: { id: body.id },
    data: { tmdbId: POSTER_IGNORED },
  });

  return NextResponse.json({ ok: true });
}
