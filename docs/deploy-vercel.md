# Put Cinemory online (Vercel + Turso)

This is the way to get your own Cinemory at a real URL, on your phone, without
owning a server. Everything used here has a free tier that is more than enough
for one person's catalog.

You do **not** need to install anything, clone the repository, or use a
terminal. If you are comfortable with a terminal there are faster shortcuts
noted along the way, but none of them are required.

Expect it to take about fifteen minutes, most of it waiting for pages to load.

**The order matters.** The app needs a database before it can start, and the
deploy asks for the database's address while it is being set up. So the
database comes first.

---

## 1. Get a TMDB key (5 minutes)

TMDB is where the posters, ratings, genres and release years come from. It is
free and the key is yours.

1. Create an account at [themoviedb.org/signup](https://www.themoviedb.org/signup).
2. Go to [Settings → API](https://www.themoviedb.org/settings/api).
3. Request a key: choose **Developer**, accept the terms, and fill in the form.
   It is for personal use and is approved immediately — for the URL and
   description you can put anything truthful, such as a personal watch-history
   catalog.
4. On that page you now have two values. Copy the long one labelled
   **API Read Access Token** and keep it somewhere for a minute.

> Keep this tab open. You will paste that token in step 4.

---

## 2. Create the database (5 minutes)

1. Sign up at [turso.tech](https://turso.tech) and create a database. Any name
   will do; `cinemory` is the obvious one.
2. Open it and find its **SQL console** — Turso's dashboard has a built-in
   editor (Outerbase Studio) for running queries against your database.
3. Open [`schema.sql`](schema.sql) in this repository, copy the **whole file**,
   paste it into that console and run it.

   That one paste creates the tables Cinemory needs. It is the only "database"
   work there is.

4. Still in Turso, find the two values the app will need:
   - the **database URL** — it looks like `libsql://cinemory-yourname.turso.io`
   - an **auth token** — Turso has a button to create one; copy it when it is
     shown, as it is usually shown once.

> ⚠️ Do not confuse Turso's dashboard console with `shell.turso.tech`. That
> second one is a demo that runs a throwaway database inside your browser —
> pasting the schema there would create tables in a database that does not
> exist anywhere. You want the console **inside your database's page**.

<details>
<summary>With the Turso CLI instead</summary>

```bash
turso db create cinemory
turso db shell cinemory < docs/schema.sql
turso db show cinemory --url      # the database URL
turso db tokens create cinemory   # the auth token
```
</details>

---

## 3. Make a session secret (1 minute)

One more value: a long random string the app uses to sign your login cookie.
It is not a password you will ever type, and nobody else needs to know it.

Any of these gives you one:

- pick the value out of a password manager's "generate password" box, set to
  40+ characters;
- run in a terminal: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
- or use any random-string generator you trust.

Keep it with the others.

---

## 4. Deploy (5 minutes)

You should now have four values:

| Name | What it is |
|---|---|
| `SESSION_SECRET` | the random string from step 3 |
| `TMDB_ACCESS_TOKEN` | the API Read Access Token from step 1 |
| `TURSO_DATABASE_URL` | the `libsql://…` address from step 2 |
| `TURSO_AUTH_TOKEN` | the token from step 2 |

There are two ways to get the code onto your own account, and the difference
only shows up months later, when there is an update to pick up. Worth thirty
seconds now.

### Either: the button (fastest)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fldtnz%2Fcinemory&project-name=cinemory&repository-name=cinemory&env=SESSION_SECRET,TMDB_ACCESS_TOKEN,TURSO_DATABASE_URL,TURSO_AUTH_TOKEN&envDescription=Four%20values%2C%20all%20free%20to%20obtain%20-%20the%20guide%20walks%20through%20each&envLink=https%3A%2F%2Fgithub.com%2Fldtnz%2Fcinemory%2Fblob%2Fmain%2Fdocs%2Fenvironment.md)

Vercel signs you in, **copies** this repository to your GitHub account, and asks
for exactly those four values. Paste them in and let it build.

The copy is a brand-new repository, not a fork — it has no link back here, so
GitHub cannot offer you later changes with a button. Picking up an update then
means a few git commands, or re-doing this step the other way. Fine if you just
want to try the thing.

### Or: fork first, import second (one minute more)

Do this if you expect to keep the app and want updates to be one click forever.

1. On [the repository page](https://github.com/ldtnz/cinemory), click **Fork**
   (top right), then **Create fork**.
2. Go to [vercel.com/new](https://vercel.com/new), choose **Import Git
   Repository** and pick your fork.
3. Before deploying, open **Environment Variables** and add the four values
   from the table above.
4. Deploy.

Same result, same amount of clicking, except your copy now knows where it came
from — which is what makes the update in the next section a single button.

When it finishes, open the URL it gives you.

---

## 5. First run (2 minutes)

The first visit opens a short setup wizard:

1. **Content language and region** — which language TMDB should answer in
   (posters, descriptions, genre names) and which country's streaming services
   to assume. You can change both later in Settings.
2. **Sign-in** — the app generates a secret, shows a QR code, and you scan it
   with an authenticator app (Google Authenticator, Aegis, 1Password, whichever
   you already use). Type back the six-digit code it shows and you are done.

   There is no password and no email. That six-digit code is how you log in
   from then on, so do not delete the entry from your authenticator.

Then add it to your phone: open the URL in the phone's browser and choose
"Add to Home Screen". It opens like an app from there on.

---

## 6. Bring your history in

Open **Settings** (the gear, top right) → **Import watch history** → **Import
from a service**. Pick the service you are coming from and the dialog tells you
where its export lives, what the file looks like, and what will happen to it.
Posters and details are fetched straight after the upload.

Some titles will not match on TMDB — streaming exports write names like
`The Office: Season 3`, or a regional title that TMDB has under a different
one. Those land in **Settings → Missing posters**, where you can search for the
right artwork or tell the app to stop asking about that title.

---

## Keeping it up to date

**Your catalog is never at stake here.** It lives in the Turso database, which
is yours and separate from the deployment: the code can be replaced, re-cloned
or deleted entirely and the data stays where it is. That is worth knowing before
reading the rest of this section, because it makes the worst case cheap.

### If you forked

On your fork's page GitHub shows **Sync fork** whenever this repository has
moved ahead. Click it, then **Update branch**. Vercel notices the push and
rebuilds on its own. That is the whole procedure.

### If you used the button

The button made an independent copy, so there is no Sync button to press. Pick
whichever of these suits you:

**Connect it to the original, once** (needs a terminal, but only this once):

```bash
git clone https://github.com/YOUR-NAME/cinemory.git
cd cinemory
git remote add upstream https://github.com/ldtnz/cinemory.git
```

and from then on, whenever you want the latest:

```bash
git fetch upstream
git merge upstream/main
git push
```

Vercel rebuilds on the push.

**Or start again as a fork** (no terminal): delete the repository the button
made and the Vercel project with it, then follow
[fork first, import second](#or-fork-first-import-second-one-minute-more)
above with the same four values. Your database is untouched, so the app comes
back with everything in it — and updates are a button from then on.

### When an update changes the database

The release notes say when this is the case. Your database needs the new
migration too, and until it gets it the app will error about a missing column.
Two ways, both fine:

- paste [`schema.sql`](schema.sql) into the Turso SQL console again — it stops
  harmlessly at the tables that already exist and adds what is new; or
- with the repository checked out and the two Turso values in a `.env`:
  `npm run db:migrate-turso`, which is safe to re-run at any time.

---

## When something goes wrong

**"SESSION_SECRET is not configured."** during the setup wizard — the variable
is missing on Vercel, or it was added after the deploy. Adding a variable does
not affect a build that already happened: add it under Settings → Environment
Variables (make sure **Production** is ticked) and then **Redeploy**.

**"Already configured."** during the setup wizard — the database already thinks
setup is finished. In the Turso SQL console: `UPDATE "Settings" SET onboarded = 0;`
and reload.

**The app loads but nothing works, or errors mention a missing table or
column** — the schema did not get in, or is older than the app. Paste
[`schema.sql`](schema.sql) into the Turso console again.

**Import and search are unavailable** — the TMDB key is missing or wrong. The
settings page says so in red when that is the case.

**No AI recommendations** — that panel only appears when `ANTHROPIC_API_KEY` is
set, which is optional. See [environment.md](environment.md).

---

## What it costs

Nothing, on the free tiers, for one person:

- **Vercel** — a hobby project stays inside the free plan.
- **Turso** — a personal catalog is a few megabytes and a few thousand reads.
- **TMDB** — free for personal use.
- **Claude** *(optional)* — the only part that can cost money, and only if you
  set `ANTHROPIC_API_KEY`. Recommendations refresh at most once every five
  days, capped server-side, which works out at a few cents a month.
