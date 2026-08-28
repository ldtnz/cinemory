import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { needsSetup } from "@/lib/settings";
import {
  createSessionCookie,
  isValidOtpCode,
  readPendingTotpToken,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
} from "@/lib/auth";

// Verifies the code the user just generated from the secret handed out by
// /setup/totp/start, and only then persists it: this is the one moment a
// TOTP secret is ever written to the database.
export async function POST(request: NextRequest) {
  if (!(await needsSetup())) {
    return NextResponse.json({ error: "Already configured." }, { status: 403 });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return NextResponse.json({ error: "SESSION_SECRET is not configured." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const token = String(body?.token ?? "");
  const code = String(body?.code ?? "").trim();

  const secret = await readPendingTotpToken(token, sessionSecret);
  if (!secret) {
    return NextResponse.json(
      { error: "This setup link expired. Start again." },
      { status: 400 },
    );
  }

  if (code.length !== 6 || !(await isValidOtpCode(code, secret))) {
    return NextResponse.json({ error: "Invalid code." }, { status: 400 });
  }

  await prisma.settings.update({
    where: { id: 1 },
    data: { totpSecret: secret, onboarded: true },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, await createSessionCookie(sessionSecret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
  return response;
}
