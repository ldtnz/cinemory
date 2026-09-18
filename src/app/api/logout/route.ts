import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

/**
 * Ends the session.
 *
 * There was no way to do this at all: the cookie lasts thirty days and the
 * only thing that invalidated it was changing SESSION_SECRET, which means
 * redeploying. It matters more now that the catalog is readable offline from
 * the service worker's cache — the client clears that itself, since a cache
 * lives in the browser and no response from here can reach it.
 *
 * Deleting the cookie is the whole of it server-side: sessions are signed
 * rather than stored, so there is no record to remove. A cookie kept by
 * someone who copied it before signing out stays valid until it expires,
 * which is what signing rather than storing costs; changing SESSION_SECRET is
 * still the way to end every session everywhere.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
