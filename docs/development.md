# Running it locally, for development

Node 22 or newer.

```bash
git clone https://github.com/ldtnz/cinemory.git
cd cinemory
npm install
cp .env.example .env          # SESSION_SECRET and TMDB_ACCESS_TOKEN are enough

npx prisma migrate deploy     # creates prisma/dev.db
npm run dev                   # http://localhost:3000
```

The first request opens the setup wizard. See
[environment.md](environment.md) for where each value comes from.

## Scripts

| | |
|---|---|
| `npm run dev` | development server (syncs from Turso first, if configured) |
| `npm run build` / `npm start` | production build and server |
| `npm run lint` | ESLint |
| `npm test` | the tests — Node's built-in runner, no framework |
| `npm run db:seed` | rebuild the catalog from the CSV exports |
| `npm run db:enrich` | fetch TMDB data for titles that have none |
| `npm run db:sync` | copy the Turso database down into `prisma/dev.db` |
| `npm run db:migrate-turso` | apply `prisma/migrations` to Turso |
| `npm run db:sql` | regenerate `docs/schema.sql` from the migrations |

## Working against the hosted database

If `TURSO_DATABASE_URL` is set, `npm run dev` pulls the Turso database down
into `prisma/dev.db` before starting, so local development runs against a copy
of real data without writing to it. `npm run db:sync` does the same on demand.

Pushing the other way is deliberately not automatic: schema changes go through
`npm run db:migrate-turso`, and content changes are made in the app.

## Adding a migration

```bash
npx prisma migrate dev --name what_it_does
npm run db:sql                # keeps docs/schema.sql in step — the suite checks this
```

`docs/schema.sql` is what the setup guide tells someone to paste into Turso's
SQL console when they have no checkout. A test fails if it is older than
`prisma/migrations`, because a forgotten regeneration would not break anything
here — it would break a stranger's install, days later, as a missing column.

For a schema change to reach a deployed Turso database, run
`npm run db:migrate-turso` with the two Turso values in `.env`. It applies the
files in order and ignores "already applied" errors, so it is safe to re-run.
`prisma migrate deploy` cannot do this: it speaks SQLite over a file, not to
the libSQL endpoint.

## Loading a catalog from the command line

```bash
npm run db:seed     # wipes the catalog and rebuilds it from the CSVs
npm run db:enrich   # fetches posters/ratings/genres for anything missing them
```

`db:seed` **replaces** the catalog, so it is for the first build; afterwards
use the incremental import in the app. `db:enrich -- --force` re-fetches
everything rather than just the new titles.

`prisma/seed-data/` ships a few fake `*.example.csv` files showing exactly what
each format looks like. Your own exports go in the same folder under the names
without `.example`, and are git-ignored.

IMDb ratings also have a script, worth using over the in-app upload when the
catalog is being built for the first time: it looks each title up by its exact
IMDb ID rather than by name, so there are no wrong matches, and it asks TMDB
which services carry the title to fill in the platform instead of leaving it as
"Not sure". One request per title, which is why the upload does neither.

```bash
npx tsx scripts/import-imdb.ts --dry-run   # report only, writes nothing
npx tsx scripts/import-imdb.ts
```

## Project layout

```
prisma/schema.prisma        the data model (one Title table)
prisma/migrations/          SQL migrations
prisma/seed-data/           the CSV exports read by db:seed
docs/                       setup guides and the pasteable schema
src/app/                    routes: catalog, stats, settings, API
src/app/api/mcp/            the MCP endpoint an assistant connects to
src/components/             the UI
src/lib/                    parsing, TMDB, auth, stats, recommendations
scripts/                    one-off and maintenance scripts
tests/                      Node test runner, no framework
```

## Notes on the database

The app picks its database at runtime: if `TURSO_DATABASE_URL` is set it goes
through Prisma's libSQL adapter to Turso, otherwise it uses the local SQLite
file. That is the only difference between the deployment options — same code,
same schema, same migrations.
