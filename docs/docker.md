# Self-hosting with Docker

For a NAS, a VPS, a Raspberry Pi or any machine you already keep running. The
database is a SQLite file on a volume — no external service, nothing to sign up
for beyond a TMDB key.

## What you need

- Docker with Compose (Docker Desktop, or `docker` + `docker compose` on Linux)
- a **TMDB key** — free, see [environment.md](environment.md#tmdb-free)
- a couple of minutes

## Install

```bash
git clone https://github.com/ldtnz/cinemory.git
cd cinemory
cp .env.example .env
```

Open `.env` and fill in two values:

- `SESSION_SECRET` — a long random string. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  gives you one, or take it from a password manager.
- `TMDB_ACCESS_TOKEN` — the API Read Access Token from TMDB.

Leave the Turso variables empty: with no `TURSO_DATABASE_URL`, the app uses the
SQLite file, which is what you want here.

Then:

```bash
docker compose up -d --build
```

Open <http://localhost:3000>. The first request opens the setup wizard: pick a
content language and region, then scan the QR code into an authenticator app
and type back the code. That is the login from then on — there is no password.

## Where the data lives

On the `cinemory-data` volume, as a single SQLite file. The container applies
the migrations every time it starts, so a fresh volume just works and an update
that changes the schema needs nothing from you.

To back it up, copy that file out — or use **Settings → Export your catalog**,
which downloads every title as JSON and does not depend on the database at all.

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations are applied on start, so there is no separate database step.

## Reaching it from outside the house

The app expects to be behind HTTPS if it is exposed: the session cookie is
marked secure, and a PWA will not install over plain HTTP. The usual answers
are a reverse proxy with a certificate (Caddy does it in about four lines, or
Nginx Proxy Manager if you prefer a UI), or a tunnel such as Tailscale or
Cloudflare Tunnel if you would rather not open a port at all.

One thing worth knowing if you want the **MCP connector** (letting an AI
assistant read your catalog in a chat): a hosted assistant fetches the endpoint
from its own servers, not from your browser, so a purely local instance is only
reachable by a client running on the same machine. Exposing it, or a tunnel,
makes it work.

## Without Docker

Node 22 or newer, same two values in `.env`:

```bash
git clone https://github.com/ldtnz/cinemory.git
cd cinemory
npm install
cp .env.example .env          # fill in SESSION_SECRET and TMDB_ACCESS_TOKEN

npx prisma migrate deploy     # creates prisma/dev.db with the schema
npm run build
npm start                     # http://localhost:3000
```

Here the migrations are **not** applied automatically: run
`npx prisma migrate deploy` again after an update that changes the schema.
