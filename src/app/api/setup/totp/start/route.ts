import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { needsSetup } from "@/lib/settings";
import { buildOtpauthUrl, createPendingTotpToken, generateTotpSecret } from "@/lib/auth";

// Generates a fresh TOTP secret and its QR code without writing anything to
// the database yet: it only becomes real once /setup/totp/confirm sees a
// code the user actually produced with it. Only usable before onboarding —
// an already-configured install does not let a bare request swap the secret.
export async function POST() {
  if (!(await needsSetup())) {
    return NextResponse.json({ error: "Already configured." }, { status: 403 });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return NextResponse.json({ error: "SESSION_SECRET is not configured." }, { status: 500 });
  }

  const secret = generateTotpSecret();
  const otpauthUrl = buildOtpauthUrl(secret);
  const qr = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 260 });
  const token = await createPendingTotpToken(secret, sessionSecret);

  return NextResponse.json({ secret, qr, token });
}
