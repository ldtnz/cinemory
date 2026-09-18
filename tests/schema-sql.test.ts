/**
 * The pasteable schema cannot be older than the migrations.
 *
 * docs/schema.sql is what the setup guide tells someone to paste into Turso's
 * SQL console, and it is the one artefact here that a stranger runs without
 * the repository in front of them. A migration added without regenerating it
 * would not break anything we run — it would break their install, days later,
 * as a missing column. So the check lives where it fails early: here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { schemaSql, SCHEMA_FILE } from "../scripts/schema-sql";

test("docs/schema.sql matches the migrations", () => {
  const committed = fs.existsSync(SCHEMA_FILE) ? fs.readFileSync(SCHEMA_FILE, "utf-8") : "";
  assert.equal(
    committed,
    schemaSql(),
    "docs/schema.sql is out of date with prisma/migrations — run `npm run db:sql`",
  );
});

test("it carries every migration, in order", () => {
  const sql = schemaSql();
  const folders = fs
    .readdirSync("prisma/migrations")
    .filter((f) => fs.existsSync(`prisma/migrations/${f}/migration.sql`))
    .sort();

  assert.ok(folders.length > 0, "no migrations found");
  let previous = -1;
  for (const folder of folders) {
    const at = sql.indexOf(`----- ${folder} -----`);
    assert.ok(at > 0, `${folder} is missing from docs/schema.sql`);
    assert.ok(at > previous, `${folder} is out of order in docs/schema.sql`);
    previous = at;
  }
});
