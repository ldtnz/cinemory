import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { parseBackup, restoreTitles } from "@/lib/restore";

// Reading and inserting only — no TMDB call, since a backup already carries
// the posters and the metadata. Still generous: a catalog of a few thousand
// titles is a few thousand rows to insert.
export const maxDuration = 60;

// A backup of 2,000 titles is around a megabyte; this leaves room for an
// order of magnitude more while still refusing a file that was never one.
const MAX_BYTE = 16 * 1024 * 1024;

/**
 * The other half of /api/export: puts a backup back into the catalog.
 *
 * It only ever adds. See src/lib/restore.ts for why, and for what counts as
 * a title already being there.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file received." }, { status: 400 });
  }
  if (file.size > MAX_BYTE) {
    return NextResponse.json({ error: "File too large (16 MB max)." }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "That file is not valid JSON." }, { status: 400 });
  }

  const parsed = parseBackup(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const report = await restoreTitles(parsed.rows, parsed.read, parsed.unreadable);
  return NextResponse.json(report);
}
