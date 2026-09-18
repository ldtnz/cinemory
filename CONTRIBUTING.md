# Contributing

Thanks for looking. This is a personal project — one person's catalog of what
they have watched — that happens to be open source. That shapes what is likely
to be accepted, so it is worth saying plainly up front.

**Very welcome:** bug reports, especially with a way to reproduce. Fixes.
Support for another service's export format. Accessibility problems.
Documentation that was wrong or assumed too much.

**Ask first:** new features, and anything that adds a dependency or a hosted
service. Not because the idea is unwelcome, but because the answer may be "that
is a fork, not a patch" and it is kinder to hear that before you write it.

**Probably not:** switching frameworks or UI libraries, multi-user accounts,
and anything that sends the catalog somewhere it does not already go.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
Security issues go to [SECURITY.md](SECURITY.md), not to a public issue.

---

## Reporting a bug

Open an [issue](https://github.com/ldtnz/cinemory/issues) with:

- what you did, what happened, and what you expected instead;
- how you are running it — Vercel + Turso, Docker, or local;
- anything the app told you. The exact message matters: several of them name
  the cause precisely, and a paraphrase loses that.

If it involves an import, the **shape** of the offending row is what helps —
the columns and a sanitised example. Please do not attach your real watch
history; it is yours, and a fake row reproduces the parser bug just as well.

## Setting up

[docs/development.md](docs/development.md) has the whole of it. Briefly:

```bash
npm install
cp .env.example .env          # SESSION_SECRET and TMDB_ACCESS_TOKEN are enough
npx prisma migrate deploy
npm run dev
```

Before you push:

```bash
npm run lint
npm test
npm run build
```

`npm test` uses Node's built-in test runner — no framework, no config. Tests
live in `tests/` and run against the local SQLite file where they need a
database; the ones that do create their own rows and delete them afterwards.

## What the code expects of you

The house style is less about formatting — the linter handles that — than about
what ends up in the repository.

**Comments say why, not what.** The code already says what it does. A comment
earns its place by recording the thing a reader cannot recover: which of two
plausible designs was chosen and what went wrong with the other, a constraint
of the platform, a bug that the odd-looking line prevents. Several comments in
here are that last kind; please do not "simplify" a line without reading the one
above it.

**Verify rather than assume.** If a change affects layout, look at it at the
widths that matter. If it affects timing, measure it. If it affects a query,
run it against rows that include the awkward case. The commit messages in this
history record numbers for that reason, and a pull request that says what it
measured is much easier to accept than one that says it should work.

**Keep the change the size of the problem.** Drive-by refactors in the same
commit as a fix make both harder to review and to revert.

**Schema changes** need a migration and a regenerated `docs/schema.sql`:

```bash
npx prisma migrate dev --name what_it_does
npm run db:sql
```

A test fails if you forget the second one — the file is what someone with no
checkout pastes into their database, and a stale copy breaks their install
rather than ours.

**English** in code, comments, commit messages and documentation, regardless of
what language the issue was written in.

## Pull requests

- Branch from `main`, one topic per pull request.
- Say in the description what the change does, why, and what you did to
  convince yourself it works.
- Screenshots for anything visual, at the width where it matters.
- Do not commit `.env`, a database file, or your own watch history. The
  repository ignores all three, but check.

Expect review to be slow and to ask questions. Expect, sometimes, a no —
particularly on features. That is not a judgement on the work; a personal
project stays usable by staying small.

## Adding support for another service's export

The most useful contribution there is, and the best-defined:

1. `src/lib/history.ts` holds the parsers and the format detection. A new format
   is a reader function plus an entry in `detectFormat` — mind the order there,
   it is deliberate, since some headers are prefixes of others.
2. `src/lib/import-sources.ts` holds what the import dialog shows: how to obtain
   the file, what its header looks like, an example row, and any caveat about
   what the export does and does not know.
3. Add a fake `*.example.csv` in `prisma/seed-data/` showing the format. Fake —
   invented rows, not an excerpt of your own history.
4. Add tests in `tests/history.test.ts`. The interesting cases are the ones that
   have bitten before: a title containing the separator, a series episode row
   that should fold into its season, a date format that is not ISO, and a header
   that could be mistaken for another service's.
