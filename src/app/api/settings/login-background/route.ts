import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { isLoginBackground } from "@/lib/login-background";
import { saveLoginBackground } from "@/lib/settings";

/** Which background the sign-in screen gets: "auto", "posters" or "terminal". */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { background?: unknown } | null;
  if (!isLoginBackground(body?.background)) {
    return NextResponse.json({ error: "Unknown background." }, { status: 400 });
  }

  await saveLoginBackground(body.background);
  return NextResponse.json({ ok: true });
}
