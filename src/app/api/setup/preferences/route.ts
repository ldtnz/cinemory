import { NextRequest, NextResponse } from "next/server";
import { needsSetup, savePreferences } from "@/lib/settings";
import { isAuthenticated } from "@/lib/auth";
import { isKnownLanguage, isKnownRegion } from "@/lib/locales";

// Used both by the first-run wizard (before login exists) and later by the
// settings page (once logged in), so either condition is enough.
export async function POST(request: NextRequest) {
  if (!(await needsSetup()) && !(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const language = String(body?.language ?? "");
  const region = String(body?.region ?? "");

  if (!isKnownLanguage(language) || !isKnownRegion(region)) {
    return NextResponse.json({ error: "Unknown language or region." }, { status: 400 });
  }

  await savePreferences(language, region);
  return NextResponse.json({ ok: true });
}
