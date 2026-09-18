/**
 * Writes docs/schema.sql: every migration, in order, as one file to paste.
 *
 * The setup guide's easy path is Turso's own SQL console — no clone, no npm,
 * no CLI — which needs the schema as a single block of SQL someone can copy.
 * Keeping that block by hand is how it goes stale: a migration is added, the
 * file is not, and the next person to follow the guide ends up with an app
 * that errors on a column nobody told them about.
 *
 * So it is generated from prisma/migrations, and a test compares the committed
 * file against a fresh run — meaning a forgotten regeneration fails the suite
 * rather than a stranger's install.
 *
 * Run with: npm run db:sql
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "prisma", "migrations");
export const SCHEMA_FILE = path.join(ROOT, "docs", "schema.sql");

const HEADER = `-- Cinemory: the whole schema, for a database that has none yet.
--
-- Generated from prisma/migrations by \`npm run db:sql\` — do not edit by hand.
--
-- Paste this into Turso's SQL console (or any SQLite client) to set up a new
-- database. It expects an empty one: run against a database that already has
-- these tables it will stop at the first "table already exists", which is
-- harmless but means there was nothing to do.
--
-- The alternative, for anyone with the repository checked out, is
-- \`npm run db:migrate-turso\`, which applies the same files and can be re-run
-- safely at any time.
`;

/** The migrations, oldest first, as one string. */
export function schemaSql(): string {
  const folders = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => fs.existsSync(path.join(MIGRATIONS, f, "migration.sql")))
    .sort();

  const parts = folders.map((folder) => {
    const sql = fs.readFileSync(path.join(MIGRATIONS, folder, "migration.sql"), "utf-8").trim();
    return `-- ----- ${folder} -----\n\n${sql}\n`;
  });

  return `${HEADER}\n${parts.join("\n")}`;
}

if (require.main === module) {
  const sql = schemaSql();
  fs.mkdirSync(path.dirname(SCHEMA_FILE), { recursive: true });
  fs.writeFileSync(SCHEMA_FILE, sql);
  console.log(`Wrote ${path.relative(ROOT, SCHEMA_FILE)} (${sql.split("\n").length} lines).`);
}
