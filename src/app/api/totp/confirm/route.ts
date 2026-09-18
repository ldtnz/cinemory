import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthenticated, isValidOtpCode, readPendingTotpToken } from "@/lib/auth";

/**
 * Finishes the swap: the code has to come from the new authenticator, so the
 * secret is only written once it is provably in someone's hands. Getting this
 * wrong would leave the catalog unreachable — there is no password to fall
 * back on.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
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
    return NextResponse.json({ error: "This took too long. Start again." }, { status: 400 });
  }
  if (code.length !== 6 || !(await isValidOtpCode(code, secret))) {
    return NextResponse.json({ error: "That code is not right." }, { status: 400 });
  }

  await prisma.settings.update({ where: { id: 1 }, data: { totpSecret: secret } });
  return NextResponse.json({ ok: true });
}
