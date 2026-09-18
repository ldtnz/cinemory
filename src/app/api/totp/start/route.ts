import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSettings } from "@/lib/settings";
import {
  buildOtpauthUrl,
  createPendingTotpToken,
  generateTotpSecret,
  isAuthenticated,
  isValidOtpCode,
} from "@/lib/auth";

/**
 * Starts swapping the authenticator for another one — a new phone, a new app,
 * or a secret that has been somewhere it should not have been.
 *
 * A code from the authenticator in use is required on top of the session,
 * which is the point: the session cookie alone must not be enough to replace
 * the second factor and lock its owner out of their own catalog.
 *
 * Nothing is written here. The new secret travels back in a signed token that
 * expires in ten minutes, exactly as it does during first-run setup, and only
 * becomes real once /api/totp/confirm sees a code produced with it.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return NextResponse.json({ error: "SESSION_SECRET is not configured." }, { status: 500 });
  }

  const settings = await getSettings();
  if (!settings.totpSecret) {
    return NextResponse.json({ error: "No authenticator is configured." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  if (code.length !== 6 || !(await isValidOtpCode(code, settings.totpSecret))) {
    return NextResponse.json({ error: "That code is not right." }, { status: 400 });
  }

  const secret = generateTotpSecret();
  const qr = await QRCode.toDataURL(buildOtpauthUrl(secret), { margin: 1, width: 260 });
  const token = await createPendingTotpToken(secret, sessionSecret);

  return NextResponse.json({ secret, qr, token });
}
