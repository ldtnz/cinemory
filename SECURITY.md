# Security policy

## Reporting a vulnerability

Please report security issues privately rather than in a public issue.

- **Preferred:** open a [private security advisory](https://github.com/ldtnz/cinemory/security/advisories/new)
  on this repository.
- **Or:** email **hello@ldtz.me**.

Say what you found, what it lets someone do, and how to reproduce it. A proof
of concept is welcome but not required — a clear description of the mechanism
is enough to act on.

This is a personal project maintained by one person in their spare time.
Expect a first reply within a week. There is no bounty programme.

Please do not test against anyone else's running instance.

## What is in scope

Cinemory is a single-user application: whoever holds the TOTP secret is the
only account, and there are no roles or tenants to escalate between. The
interesting questions are therefore about the boundary between "signed in" and
"not signed in", and about the credentials the app holds on your behalf.

Worth reporting:

- anything reachable **without** a valid session that returns catalog data or
  changes it. Exactly five routes are meant to be reachable unauthenticated:
  `/api/login`, the two first-run setup routes (which refuse once setup is
  done), and the two MCP endpoints (which require their own token instead).
  Every other route checks the session;
- a way to forge or extend a session without the TOTP code;
- a way to get the MCP endpoint to answer without a valid token, or a
  read-scoped token reaching a write tool;
- a way to read `SESSION_SECRET`, the stored TOTP secret, or the TMDB or
  Anthropic keys from the client bundle or from any response;
- XSS, SSRF, or injection anywhere — note that title text and imported CSV
  content are untrusted input;
- a way for an unauthenticated request to make the server call TMDB or Anthropic
  on someone else's key.

## Known and deliberate

These are design decisions, not oversights, and reports about them will be
closed as such — though an argument that one of them is wrong is welcome as an
ordinary issue.

- **The MCP credential is a bearer token**, and one of the two ways to carry it
  puts it in a URL. That is what a connector can store. It is hashed at rest,
  shown once, revocable in a click, and read-only unless you deliberately mint
  a write-capable one. See [docs/mcp.md](docs/mcp.md).
- **A missing or wrong MCP token gets a plain 404 on the URL-with-token form**,
  and `401` with a challenge on the plain address. The asymmetry is deliberate:
  in the first form the address *is* the credential.
- **The login limiter is a cookie**: five failed attempts inside a 60-second
  window and it refuses, counted in a cookie the client sends back. A client
  that simply discards that cookie is not limited, and this is known. Against a
  six-digit code on a 30-second window, on a personal instance nobody is
  pointed at, it is judged proportionate. If you can show it is not — a
  practical rate against a real deployment — that is a report worth making.
- **`SESSION_SECRET` lives outside the database on purpose**, so that a leaked
  database alone cannot forge a session.
- **Sessions are signed, not stored.** Signing out clears the cookie on that
  device, which is what it is for; a cookie someone copied beforehand stays
  valid until it expires, because there is no list of sessions to strike it
  from. Changing `SESSION_SECRET` ends every session everywhere, and remains
  the answer if you think a cookie leaked.
- **The catalog is not encrypted at rest.** It is a list of films someone
  watched, held in their own database.
- **The sign-in screen shows posters from the catalog**, drifting behind the
  card, so anyone who opens the address sees what kind of thing is in there.
  Artwork only — no titles, no dates, no counts, and nothing that can be acted
  on without a code. Settings → Sign-in screen replaces it with an animation
  that reveals nothing at all.
- **Self-hosted instances exposed over plain HTTP** are insecure by
  construction: the session cookie is marked secure and a PWA will not install.
  Put it behind HTTPS — see [docs/docker.md](docs/docker.md).

## Supported versions

The latest commit on `main`. There are no release branches and no backports: if
something needs fixing, it is fixed on `main` and you update.

## Keeping your own instance safe

If you are running Cinemory yourself, most of the risk is in configuration
rather than in the code:

- keep `SESSION_SECRET` long and random, and out of the repository — see
  [docs/environment.md](docs/environment.md);
- never commit a `.env`; the repository ignores it, but a copy pasted into an
  issue is just as public;
- keep the app behind HTTPS;
- treat the MCP URL or token as a password, and switch the connector off when
  you are not using it;
- if you think a credential leaked: rotate the TMDB and Anthropic keys with
  their providers, change `SESSION_SECRET` (which logs out every session), and
  regenerate the MCP credential from Settings, which invalidates the old one
  immediately;
- if the TOTP secret itself is the worry — a photographed QR code, a phone you
  no longer have — **Settings → Signing in → Use a different authenticator**
  replaces it. It asks for a code from the authenticator in use before it
  starts, so a stolen session cannot move the sign-in and lock you out, and
  only writes the new secret once you have proved a code from it.
