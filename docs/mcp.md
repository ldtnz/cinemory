# Connecting an assistant over MCP

Cinemory can expose its catalog over [MCP](https://modelcontextprotocol.io), so
an AI assistant can answer questions about what you have watched during an
ordinary chat — instead of guessing, or making you paste an export into it.

It is off until you switch it on, and revocable in a click.

Settings -> **MCP connector** turns on an MCP endpoint and hands you its address
and a token. MCP is an open standard, so anything that speaks it can connect;
claude.ai is the worked example here because it is the one most people will be
setting up. Add it there under Customize -> Connectors -> Add custom connector,
and the assistant can answer "have I seen this?", "what's on my list?" and "what
did I watch last year?" from your own catalog instead of guessing.

Four read tools — `search_catalog`, `catalog_stats`, `watchlist` and
`recently_watched` — and, if you generate the wider credential instead, three
more: `add_to_watchlist`, `mark_as_watched` and `edit_watched`.

**Writing is a separate credential, not a setting.** What a connector may do is
decided when you hand it out, and going back to read-only is generating the
read-only one again. The wider one adds a title, moves one into the watched
half, and corrects where or when something was watched — nothing there deletes,
and nothing moves a title back out of the catalog, so the worst it can do is
make the catalog wrong in ways you can see and fix in the app.

No OAuth, and on purpose. What OAuth would buy here is expiry and rotation; the
cost is an authorization server — the kind of code where mistakes are expensive
— guarding a personal film catalog that has a JSON export as a backup. The
scope instead rides in the token, in a prefix that is part of what was hashed:
editing `ro_` to `rw_` does not widen anything, it stops the token matching at
all.

**Two ways to carry the same token.** A header against the plain `/api/mcp`
address is the one to prefer — it is what the MCP spec expects, and it keeps the
secret out of browser history, referrers and anything that logs a path. Either
`Authorization: Bearer <token>` or `X-API-Key: <token>` is accepted, because
connector forms disagree about where an API key belongs. A client with nowhere
to put a header can use the URL with the token in it instead. The settings page
hands out both forms, and they are the same credential, so revoking covers both
at once.

**However it travels, the token is the credential** — anyone holding it can read
your catalog. A few things follow, and they are the reason the feature is
shaped this way:

- It is shown **once**, when you generate it — only a SHA-256 digest is stored,
  so a database dump does not yield a working credential and neither does this
  page on a later visit.
- Generating a new one **immediately stops the old one working**. That is how a
  leak is revoked.
- Read-only means the worst case is disclosure, not damage.
- The two addresses refuse differently, on purpose. The URL-with-the-token form
  *is* the credential, so a wrong one gets the same plain 404 as a path that was
  never routed and a prober learns nothing. The plain address has nothing to
  hide — it is made to be pasted into a connector's settings — and answers `401`
  with a `WWW-Authenticate` challenge, so a client can say "your token is
  missing" instead of "there is no server here".

A hosted assistant fetches the endpoint from its own servers, not from your
browser, so it has to be reachable from the public internet — fine on Vercel,
and fine on a self-hosted instance that is exposed. A purely local instance can
only be reached by a client running on the same machine.

It is off until you turn it on, and "Switch off" clears it entirely.
