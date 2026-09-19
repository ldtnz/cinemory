import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { saveDisplayName } from "@/lib/settings";
import { DISPLAY_NAME_MAX } from "@/lib/settings-limits";

/** Saves the name the app calls its user by. Setup runs signed in by now. */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length > DISPLAY_NAME_MAX) {
    return NextResponse.json(
      { error: `Keep it to ${DISPLAY_NAME_MAX} characters or fewer.` },
      { status: 400 },
    );
  }

  await saveDisplayName(name);
  return NextResponse.json({ ok: true });
}
