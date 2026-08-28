import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_DURATION_SECONDS,
  LOCKOUT_WINDOW_SECONDS,
  SESSION_COOKIE_NAME,
  ATTEMPTS_COOKIE_NAME,
  MAX_ATTEMPTS,
  isValidOtpCode,
  createSessionCookie,
} from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const settings = await getSettings();
  const totpSecret = settings.totpSecret;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!settings.onboarded || !totpSecret) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }
  if (!sessionSecret) {
    return new NextResponse("SESSION_SECRET is not configured.", { status: 500 });
  }

  const returnUrl = new URL("/", request.url);

  // Temporary lockout after too many failed attempts close together.
  const attemptsCookie = request.cookies.get(ATTEMPTS_COOKIE_NAME)?.value;
  const [countStr, startStr] = (attemptsCookie ?? "").split(".");
  const count = Number(countStr) || 0;
  const start = Number(startStr) || 0;
  const now = Math.floor(Date.now() / 1000);
  const insideWindow = now - start < LOCKOUT_WINDOW_SECONDS;

  if (insideWindow && count >= MAX_ATTEMPTS) {
    returnUrl.searchParams.set("error", "locked");
    return NextResponse.redirect(returnUrl, { status: 303 });
  }

  const formData = await request.formData().catch(() => null);
  const code = String(formData?.get("code") ?? "").trim();

  if (code.length === 6 && (await isValidOtpCode(code, totpSecret))) {
    const response = NextResponse.redirect(returnUrl, { status: 303 });
    response.cookies.set(SESSION_COOKIE_NAME, await createSessionCookie(sessionSecret), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_DURATION_SECONDS,
      path: "/",
    });
    response.cookies.delete(ATTEMPTS_COOKIE_NAME);
    return response;
  }

  const newCount = insideWindow ? count + 1 : 1;
  const newStart = insideWindow ? start : now;
  returnUrl.searchParams.set("error", "code");
  const response = NextResponse.redirect(returnUrl, { status: 303 });
  response.cookies.set(ATTEMPTS_COOKIE_NAME, `${newCount}.${newStart}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: LOCKOUT_WINDOW_SECONDS,
    path: "/",
  });
  return response;
}
