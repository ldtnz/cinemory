/**
 * The setting that decides what the sign-in screen draws.
 *
 * It is written by an authenticated request and read by an unauthenticated
 * page, which is the reason to be careful about what it can be set to: the
 * value comes back out into the markup of a screen anyone can open.
 */
import { test, before, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

let authenticated = true;
mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let POST: typeof import("@/app/api/settings/login-background/route").POST;
let original: string;

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/settings/login-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const stored = async () =>
  (await prisma.settings.findUniqueOrThrow({ where: { id: 1 } })).loginBackground;

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("@/app/api/settings/login-background/route"));
  original = await stored();
});

afterAll(async () => {
  await prisma.settings.update({ where: { id: 1 }, data: { loginBackground: original } });
  await prisma.$disconnect();
});

test("each of the three choices is stored", async () => {
  for (const background of ["terminal", "posters", "auto"]) {
    const res = await post({ background });
    assert.equal(res.status, 200);
    assert.equal(await stored(), background);
  }
});

test("anything else is refused, and nothing is written", async () => {
  await post({ background: "posters" });
  for (const background of ["Posters", "video", "", null, 7, ["auto"]]) {
    const res = await post({ background });
    assert.equal(res.status, 400, `accepted ${JSON.stringify(background)}`);
  }
  assert.equal(await stored(), "posters");
});

test("without a session it does not write", async () => {
  await post({ background: "auto" });
  authenticated = false;
  const res = await post({ background: "terminal" });
  authenticated = true;
  assert.equal(res.status, 401);
  assert.equal(await stored(), "auto");
});
