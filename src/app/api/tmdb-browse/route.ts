import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { browseTmdb } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const suggestions = await browseTmdb();
  return NextResponse.json(suggestions, {
    headers: { "Cache-Control": "no-store" },
  });
}
