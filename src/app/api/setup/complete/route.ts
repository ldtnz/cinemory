import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Completes onboarding after the optional watch-history import step. */
export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings?.totpSecret) {
    return NextResponse.json({ error: "Sign-in is not configured." }, { status: 400 });
  }

  await prisma.settings.update({
    where: { id: 1 },
    data: { onboarded: true },
  });

  return NextResponse.json({ ok: true });
}
