/**
 * Syncs the local prisma/dev.db file with the Turso database used in
 * production, pulling down any titles added from the hosted app (for instance
 * through "Add title") since the last import. It downloads every row from
 * Turso and rewrites the local table (wipe and re-insert), so dev.db stays a
 * plain SQLite file the other scripts (seed.ts, import-imdb.ts, enrich-tmdb.ts)
 * and Prisma can use offline during development.
 *
 * Runs automatically before every `npm run dev` (see "predev" in package.json).
 * If TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are not set in .env it does nothing:
 * local development keeps working offline on dev.db as it is. If Turso is
 * unreachable it does not block development either — it warns and carries on
 * with the local copy.
 *
 * Run manually with: npm run db:sync
 */
// Must come first: it makes .env visible to everything below.
import "./load-env";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { createClient } from "@libsql/client";
import path from "node:path";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

async function main() {
  if (!TURSO_URL) {
    console.log(
      "TURSO_DATABASE_URL is not set in .env: skipping the sync, using the local dev.db as it is.",
    );
    return;
  }

  const libsql = createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN });
  const remote = new PrismaClient({ adapter: new PrismaLibSQL(libsql) });

  const localDbPath = path.join(process.cwd(), "prisma", "dev.db");
  const local = new PrismaClient({ datasources: { db: { url: `file:${localDbPath}` } } });

  console.log("Syncing dev.db with Turso...");

  const titles = await remote.title.findMany();

  await local.$transaction([
    local.title.deleteMany(),
    local.title.createMany({ data: titles }),
  ]);

  console.log(`dev.db synced: ${titles.length} titles.`);

  await remote.$disconnect();
  await local.$disconnect();
}

main().catch((error) => {
  console.warn("Turso sync failed, using the local dev.db as it is:", error.message);
});
