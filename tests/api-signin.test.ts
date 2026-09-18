/**
 * Ending a session, and moving the sign-in to another authenticator.
 *
 * Both are new, and both are the kind of thing that is quietly wrong until
 * someone needs it: a sign-out that does not clear the cookie, or a
 * replacement that writes a secret nobody can produce codes from, would lock
 * the catalog away — there is no password and no email to fall back on.
 *
 * The TOTP maths itself (src/lib/auth.ts) is real here: the codes these tests
 * send are computed the same way an authenticator app computes them.
 */
import { test, before, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import * as realAuth from "@/lib/auth";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";
process.env.SESSION_SECRET ??= "tests-only-not-a-real-secret";

let authenticated = true;
// The real module first, then a copy of it with only the session check stood
// in for: everything else here — the TOTP verification, the signed
// pending-secret token — has to be the genuine article, or the test would be
// checking its own arithmetic. A module can only be mocked once, so this
// happens at the top rather than in before().
// (statically imported above, so it is evaluated before the mock replaces it)
mock.module("@/lib/auth", {
  namedExports: { ...realAuth, isAuthenticated: async () => authenticated },
});

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let logout: typeof import("@/app/api/logout/route").POST;
let start: typeof import("@/app/api/totp/start/route").POST;
let confirm: typeof import("@/app/api/totp/confirm/route").POST;
let SESSION_COOKIE_NAME: string;

let restoreSecret: string | null = null;

/** A six-digit code for a base32 secret, the way an authenticator makes one. */
function totp(base32Secret: string, atStep = Math.floor(Date.now() / 1000 / 30)): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of base32Secret.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(atStep, 4);
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function post(handler: (r: NextRequest) => Promise<Response>, url: string, body: unknown) {
  return handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  SESSION_COOKIE_NAME = realAuth.SESSION_COOKIE_NAME;
  ({ POST: logout } = await import("@/app/api/logout/route"));
  ({ POST: start } = await import("@/app/api/totp/start/route"));
  ({ POST: confirm } = await import("@/app/api/totp/confirm/route"));

  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  restoreSecret = settings.totpSecret;
  await prisma.settings.update({
    where: { id: 1 },
    // A secret of this file's own, so the developer database's real one is
    // never used to produce codes and is put back afterwards.
    data: { totpSecret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP" },
  });
});

afterAll(async () => {
  await prisma.settings.update({ where: { id: 1 }, data: { totpSecret: restoreSecret } });
  await prisma.$disconnect();
});

test("signing out clears the session cookie", async () => {
  const res = await logout();
  assert.equal(res.status, 200);
  const cookie = res.cookies.get(SESSION_COOKIE_NAME);
  assert.equal(cookie?.value, "");
  assert.equal(cookie?.maxAge, 0);
});

test("a replacement needs a code from the authenticator in use", async () => {
  const res = await post(start, "http://localhost/api/totp/start", { code: "000000" });
  assert.equal(res.status, 400);
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(settings.totpSecret, "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", "nothing changed");
});

test("without a session it does not even start", async () => {
  authenticated = false;
  const res = await post(start, "http://localhost/api/totp/start", {
    code: totp("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"),
  });
  authenticated = true;
  assert.equal(res.status, 401);
});

test("the new secret is only written once a code proves it works", async () => {
  const current = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const started = await post(start, "http://localhost/api/totp/start", { code: totp(current) });
  assert.equal(started.status, 200);
  const { secret, token, qr } = (await started.json()) as {
    secret: string;
    token: string;
    qr: string;
  };
  assert.match(qr, /^data:image\/png;base64,/);
  assert.notEqual(secret, current);

  // Still the old one at this point: starting hands out a secret, it does not
  // adopt it.
  let settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(settings.totpSecret, current);

  // A code from the old authenticator does not confirm the new one.
  const wrong = await post(confirm, "http://localhost/api/totp/confirm", {
    token,
    code: totp(current),
  });
  assert.equal(wrong.status, 400);
  settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(settings.totpSecret, current);

  const right = await post(confirm, "http://localhost/api/totp/confirm", {
    token,
    code: totp(secret),
  });
  assert.equal(right.status, 200);
  settings = await prisma.settings.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(settings.totpSecret, secret, "the new authenticator is the one that counts now");
});

test("a token that was not signed here is refused", async () => {
  const res = await post(confirm, "http://localhost/api/totp/confirm", {
    token: "9999999999.JBSWY3DPEHPK3PXP.deadbeef",
    code: "123456",
  });
  assert.equal(res.status, 400);
});
