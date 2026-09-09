import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * A full backup of the catalog as JSON — every column of every row, not a
 * curated subset, so it can restore or move elsewhere without guessing at a
 * schema. This is the only export Cinemory offers, and it exists because
 * there is no other copy of years of watch history outside this database.
 */
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const titles = await prisma.title.findMany({ orderBy: { id: "asc" } });

  // Versioned from the start: the shape of a backup is a promise to anyone
  // who might try to read it back in a year, after the schema has moved on.
  const payload = { version: 1, exportedAt: new Date().toISOString(), titles };

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="cinemory-export-${date}.json"`,
    },
  });
}
