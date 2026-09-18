# Environment variables

Every variable is also documented in [`.env.example`](../.env.example).

| Variable | Required | What it is |
|---|---|---|
| `SESSION_SECRET` | yes | random string used to sign the session cookie |
| `TMDB_ACCESS_TOKEN` | yes\* | TMDB v4 "API Read Access Token" |
| `TMDB_API_KEY` | yes\* | TMDB v3 "API Key" — the alternative to the token |
| `ANTHROPIC_API_KEY` | no | enables the AI "what to watch next" recommendations |
| `DATABASE_URL` | self-hosted | path to the SQLite file |
| `TURSO_DATABASE_URL` | serverless | libSQL endpoint; when set, it wins over `DATABASE_URL` |
| `TURSO_AUTH_TOKEN` | serverless | token for that database |

\* one of the two TMDB credentials, not both. Nothing is baked into the client
bundle: every TMDB call goes through the app's own API routes, so the key stays
on the server.

The TOTP secret and the content language/region are **not** environment
variables — the setup wizard on first run stores them in the database. Only
`SESSION_SECRET` stays outside it: keeping the key that signs the session
cookie out of the database it protects means a leaked database alone cannot be
used to forge a session, only to read the catalog and the (equally
database-stored) TOTP secret.

---

## Where each one comes from

### TMDB (free)

Posters, ratings, genres, release years and the search behind "add a title" all
come from TMDB. Without it the app runs but import and search are unavailable,
and the settings page says so.

1. Create an account at [themoviedb.org/signup](https://www.themoviedb.org/signup).
2. Go to [Settings → API](https://www.themoviedb.org/settings/api).
3. Request a **Developer** key — it is for personal use and approved
   immediately.
4. Copy the **API Read Access Token** (the long one) into `TMDB_ACCESS_TOKEN`,
   or the shorter **API Key (v3 auth)** into `TMDB_API_KEY`. Either works.

### SESSION_SECRET

Any long random string. It is never typed by anyone; it signs the login cookie.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

A 40-plus character password from a password manager does just as well.

Changing it later logs out every open session — the cookies were signed with
the old one — but nothing else: the TOTP secret is stored separately, so you
log in again with the same authenticator code.

### Turso (serverless deployments)

See [deploy-vercel.md](deploy-vercel.md#2-create-the-database-5-minutes). In
short: create a database at [turso.tech](https://turso.tech), take its
`libsql://…` URL and create an auth token.

### Claude API (optional)

Create a key at
[console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
and set `ANTHROPIC_API_KEY`. Without it the recommendations panel on the
settings page is simply hidden and everything else works.

Recommendations refresh themselves every 5 days; a refresh — automatic, or an
early manual one from the settings page — is capped server-side to once per
5-day window, so the running cost stays a few cents a month.

---

## Setting them on Vercel

Project → **Settings** → **Environment Variables**. Two things people trip on:

- tick **Production**, not only Preview and Development;
- a variable added after a deploy does not reach it. **Redeploy** afterwards —
  the last deployment, no new commit needed.
