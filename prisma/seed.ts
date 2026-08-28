/**
 * Seed script: imports the Netflix and Amazon Prime Video watch history into
 * the database.
 *
 * It wipes and refills the catalog, so it is meant for building it the first
 * time. To add only what is new in a more recent export there is the
 * incremental import on the /settings page, which de-duplicates against what
 * is already there. Both paths read the CSVs the same way (src/lib/history.ts).
 *
 * Sources:
 *  - prisma/seed-data/NetflixViewingHistory.csv    (official Netflix export: Title,Date)
 *  - prisma/seed-data/AmazonWatchHistoryExport.csv (export from "Watch History Exporter for
 *    Amazon Prime Video", https://github.com/caret-collective/watch-history-exporter-for-amazon-prime-video)
 *
 * Drop your own exports in prisma/seed-data/ under those names. When one is
 * missing the matching *.example.csv is used instead, so the seed works out of
 * the box on a fresh clone with a handful of fake rows.
 *
 * Run with: npm run db:seed
 */
// Must come first: it makes .env visible to everything below.
import "../scripts/load-env";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { readAmazon, readNetflix } from "@/lib/history";
import { resolveLocalDatabaseUrl } from "@/lib/prisma";

// Always the local SQLite file, never Turso: this script wipes the catalog.
const prisma = new PrismaClient({
  datasources: { db: { url: resolveLocalDatabaseUrl() } },
});

const SEED_DIR = path.join(__dirname, "seed-data");

/** Reads an export, falling back to the bundled fake sample when it is absent. */
function readFile(name: string): string {
  const own = path.join(SEED_DIR, name);
  if (fs.existsSync(own)) return fs.readFileSync(own, "utf-8");

  const sample = path.join(SEED_DIR, name.replace(/\.csv$/, ".example.csv"));
  if (fs.existsSync(sample)) {
    console.log(`  (${name} not found, using the ${path.basename(sample)} sample)`);
    return fs.readFileSync(sample, "utf-8");
  }

  throw new Error(`Missing ${own}. Put your export there, or keep the bundled sample.`);
}

async function main() {
  console.log("Importing Netflix...");
  const netflix = readNetflix(readFile("NetflixViewingHistory.csv"));
  console.log(`  -> ${netflix.length} unique titles`);

  console.log("Importing Amazon Prime Video...");
  const amazon = readAmazon(readFile("AmazonWatchHistoryExport.csv"));
  console.log(`  -> ${amazon.length} unique titles`);

  console.log("Emptying the Title table...");
  await prisma.title.deleteMany();

  console.log("Inserting into the database...");
  const all = [...netflix, ...amazon];
  const BATCH = 100;
  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);
    await prisma.title.createMany({ data: batch });
  }

  console.log(`Done. ${all.length} titles imported.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
