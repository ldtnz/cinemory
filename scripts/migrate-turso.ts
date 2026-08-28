/**
 * Applies the migrations in prisma/migrations to Turso.
 *
 * sync-turso.ts only goes from Turso to the local file, so a schema change has
 * no other way of reaching production: `prisma migrate deploy` speaks SQLite
 * over a file, not to the libSQL endpoint.
 *
 * Safe to re-run: "column already exists" (or already dropped) errors are
 * ignored, so migrations that were already applied do no harm.
 *
 * Run with: npm run db:migrate-turso   (needs TURSO_DATABASE_URL and
 * TURSO_AUTH_TOKEN in .env, the same ones configured on the host)
 */
// Must come first: it makes .env visible to everything below.
import "./load-env";
import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

/** Errors that mean "this migration had already been applied". */
function alreadyApplied(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("duplicate column") ||
    m.includes("already exists") ||
    m.includes("no such column")
  );
}

/** Splits a .sql file into statements, skipping comments. */
function statements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) =>
      s
        .split("\n")
        .filter((row) => !row.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

async function main() {
  if (!TURSO_URL) {
    console.error("TURSO_DATABASE_URL is not set in .env: nothing to do.");
    process.exit(1);
  }

  const libsql = createClient({ url: TURSO_URL, authToken: TURSO_AUTH_TOKEN });
  const dir = path.join(__dirname, "..", "prisma", "migrations");
  const folders = fs
    .readdirSync(dir)
    .filter((f) => fs.existsSync(path.join(dir, f, "migration.sql")))
    .sort();

  for (const folder of folders) {
    const sql = fs.readFileSync(path.join(dir, folder, "migration.sql"), "utf-8");
    console.log(`\n${folder}`);
    for (const s of statements(sql)) {
      const short = s.replace(/\s+/g, " ").slice(0, 70);
      try {
        await libsql.execute(s);
        console.log(`  applied: ${short}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (alreadyApplied(message)) {
          console.log(`  already fine: ${short}`);
        } else {
          console.error(`  ERROR on: ${short}\n    ${message}`);
          process.exit(1);
        }
      }
    }
  }

  console.log("\nDone: the Turso schema matches prisma/migrations.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
