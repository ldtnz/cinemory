/**
 * The restore route, as a route: what it accepts, what it refuses, and that
 * a refusal writes nothing.
 *
 * The reconciliation itself is tested in tests/restore.test.ts against the
 * library; this covers the layer around it, where a whole catalog arrives as
 * an uploaded file from outside.
 */
import { test, before, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.DATABASE_URL ??= "file:./prisma/dev.db";

let authenticated = true;
mock.module("@/lib/auth", { namedExports: { isAuthenticated: async () => authenticated } });

type Db = Awaited<typeof import("@/lib/prisma")>["prisma"];
let prisma: Db;
let POST: typeof import("@/app/api/restore/route").POST;

const MARK = "zzrestoreroute";

function backupOf(titles: unknown[]) {
  return JSON.stringify({ version: 1, exportedAt: "2025-01-01T00:00:00.000Z", titles });
}

function title(name: string) {
  return {
    title: `${MARK} ${name}`,
    platform: "Netflix",
    mediaType: "Movie",
    status: "Watched",
    lastWatchedAt: "2024-03-02T00:00:00.000Z",
    inWatchlist: false,
  };
}

async function upload(content: string, name = "cinemory-export.json") {
  const form = new FormData();
  form.append("file", new File([content], name, { type: "application/json" }));
  const res = await POST(
    new NextRequest("http://localhost/api/restore", { method: "POST", body: form }),
  );
  return { status: res.status, body: await res.json() };
}

const stored = () => prisma.title.count({ where: { title: { startsWith: MARK } } });

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST } = await import("@/app/api/restore/route"));
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
});

afterAll(async () => {
  await prisma.title.deleteMany({ where: { title: { startsWith: MARK } } });
  await prisma.$disconnect();
});

test("without a session a backup is not read", async () => {
  authenticated = false;
  const { status } = await upload(backupOf([title("unauthorised")]));
  authenticated = true;
  assert.equal(status, 401);
  assert.equal(await stored(), 0);
});

test("a backup is restored and reported", async () => {
  const { status, body } = await upload(backupOf([title("one"), title("two")]));
  assert.equal(status, 200);
  assert.deepEqual(body, { read: 2, added: 2, alreadyPresent: 0, unreadable: 0 });
  assert.equal(await stored(), 2);
});

test("restoring it again adds nothing", async () => {
  const { body } = await upload(backupOf([title("one"), title("two")]));
  assert.equal(body.added, 0);
  assert.equal(body.alreadyPresent, 2);
  assert.equal(await stored(), 2);
});

test("a file that is not JSON is refused with a reason, and writes nothing", async () => {
  const { status, body } = await upload("not a backup at all", "notes.txt");
  assert.equal(status, 400);
  assert.match(body.error, /JSON/i);
  assert.equal(await stored(), 2);
});

test("a backup from a newer version is refused rather than half-read", async () => {
  const { status, body } = await upload(
    JSON.stringify({ version: 2, titles: [title("from the future")] }),
  );
  assert.equal(status, 400);
  assert.match(body.error, /version/i);
  assert.equal(await stored(), 2);
});

test("a request with no file at all is refused", async () => {
  const res = await POST(
    new NextRequest("http://localhost/api/restore", { method: "POST", body: new FormData() }),
  );
  assert.equal(res.status, 400);
});
