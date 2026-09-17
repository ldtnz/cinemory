/**
 * The MCP endpoint: Cinemory as a connector in an AI assistant.
 *
 * MCP is an open standard, so this is not built for one client — claude.ai
 * takes it under Customize -> Connectors -> Add custom connector, and anything
 * else that adds an MCP server takes the same two strings. A hosted assistant
 * fetches this from its own servers rather than from the reader's browser,
 * which is why it is reachable without a session cookie and needs a credential
 * of its own.
 *
 * That credential arrives one of two ways. A header is the better one and what
 * the MCP spec expects — the URL stays a plain, stable address, and the secret
 * stays out of browser history, referrers and anything that logs a path. Either
 * Authorization: Bearer or X-API-Key will do, because connector forms disagree
 * about which an API key belongs in. A client with nowhere to put a header can
 * instead use a URL with the token in it; both are checked the same way, and
 * the settings page hands out both forms.
 *
 * Read-only unless the credential says otherwise. A token generated with writes
 * enabled reaches three more tools: adding to the watchlist, moving something
 * into the watched half, and correcting where or when something was watched.
 * None of them deletes, and none moves a title back out of the catalog, so the
 * worst the wider credential can do is make the catalog wrong in ways the app
 * can see and fix.
 *
 * Which tools exist is decided by the token, not checked inside them: two
 * handlers are built, and the scope picks one. A read-only connector is never
 * even told the write tools are there.
 */
import { createMcpHandler } from "mcp-handler";
import { prisma } from "@/lib/prisma";
import { isValidMcpToken, scopeOf, tokenFromHeaders } from "@/lib/mcp-token";
import { z } from "zod";
import {
  MAX_RESULTS,
  addToWatchlist,
  editWatched,
  catalogStats,
  markAsWatched,
  recentlyWatched,
  searchCatalog,
  watchlist,
} from "@/lib/mcp-catalog";

const limit = z
  .number()
  .int()
  .min(1)
  .max(MAX_RESULTS)
  .optional()
  .describe(`How many to return, up to ${MAX_RESULTS}.`);

/** Tool results travel as text; JSON keeps them parseable by the model
 *  without inventing a format for every answer. */
function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

function build(allowWrites: boolean) {
  return createMcpHandler(
  (server) => {
    server.registerTool(
      "search_catalog",
      {
        title: "Search the catalog",
        description:
          "Search what the user has watched or has waiting. Use this to answer " +
          "'have I seen X?', 'what have I watched by/about X?', 'what did I watch " +
          "in 2024?', and anything filtered by genre, platform or film vs series. " +
          "Omit the query to browse by filter alone.",
        inputSchema: z.object({
          query: z.string().optional().describe("Part of a title. Case and punctuation do not matter."),
          status: z
            .enum(["watched", "watchlist", "any"])
            .optional()
            .describe("Watched titles, the to-watch list, or both. Defaults to both."),
          mediaType: z.enum(["Movie", "Series"]).optional(),
          genre: z
            .string()
            .optional()
            .describe(
              "One genre, spelled exactly as this catalog spells it. Genres come " +
                "from TMDB in the catalog's own language and may not be English — " +
                "call catalog_stats first and use a name from the genres it lists, " +
                "rather than guessing.",
            ),
          platform: z
            .string()
            .optional()
            .describe("Where it was watched, e.g. Netflix. catalog_stats lists the ones in use."),
          from: z
            .string()
            .optional()
            .describe("Only titles watched on or after this date (YYYY-MM-DD)."),
          to: z
            .string()
            .optional()
            .describe("Only titles watched on or before this date (YYYY-MM-DD), that day included."),
          limit,
        }),
        annotations: READ_ONLY,
      },
      async (args) => json(await searchCatalog(args)),
    );

    server.registerTool(
      "catalog_stats",
      {
        title: "Catalog statistics",
        description:
          "Totals and breakdowns for the whole catalog: how many titles, films " +
          "against series, seasons watched, platforms, every genre with a count, " +
          "busiest years, and the first and most recent thing watched. Also the " +
          "way to learn the exact genre and platform names search_catalog accepts.",
        annotations: READ_ONLY,
        inputSchema: z.object({}),
      },
      async () => json(await catalogStats()),
    );

    server.registerTool(
      "watchlist",
      {
        title: "The to-watch list",
        description: "Titles the user has saved to watch but has not watched yet, newest first.",
        annotations: READ_ONLY,
        inputSchema: z.object({ limit }),
      },
      async ({ limit }) => json(await watchlist(limit)),
    );

    server.registerTool(
      "recently_watched",
      {
        title: "Recently watched",
        description:
          "The most recently watched titles, newest first. Titles whose watch " +
          "date is unknown are left out rather than dated wrongly.",
        annotations: READ_ONLY,
        inputSchema: z.object({ limit }),
      },
      async ({ limit }) => json({ titles: await recentlyWatched(limit) }),
    );

    if (!allowWrites) return;

    server.registerTool(
      "add_to_watchlist",
      {
        title: "Add to the to-watch list",
        description:
          "Put a title on the user's to-watch list. Matched on TMDB first, so " +
          "it arrives with a poster and metadata. Refuses rather than duplicates " +
          "anything already in the catalog.",
        // Additive and safe to repeat: a second call finds it already there.
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        inputSchema: z.object({
          title: z.string().describe("The title to add."),
          mediaType: z
            .enum(["Movie", "Series"])
            .optional()
            .describe("Helps TMDB pick the right entry when a name is both."),
        }),
      },
      async ({ title, mediaType }) => json(await addToWatchlist(title, mediaType)),
    );

    server.registerTool(
      "mark_as_watched",
      {
        title: "Mark as watched",
        description:
          "Move a title already on the to-watch list into the watched half. " +
          "Does not add anything that is not in the catalog, and cannot remove.",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        inputSchema: z.object({
          title: z.string().describe("A title already in the catalog."),
          platform: z
            .string()
            .optional()
            .describe("Where it was watched. Left as \"Not sure\" if unrecognised."),
          on: z.string().optional().describe("When, as YYYY-MM-DD. Defaults to today."),
        }),
      },
      async ({ title, platform, on }) => json(await markAsWatched(title, platform, on)),
    );

    server.registerTool(
      "edit_watched",
      {
        title: "Correct a watched title",
        description:
          "Change where or when something already watched was watched — the " +
          "fix for an import that guessed the platform, or a date that was " +
          "only ever approximate. Only the fields given are changed. It cannot " +
          "move a title back to the to-watch list or remove it.",
        // Not idempotent in the useful sense: called twice with different
        // values, the second wins, and it overwrites rather than adds.
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        inputSchema: z.object({
          title: z
            .string()
            .describe(
              "A title already marked as watched. If the name matches several, " +
                "the answer says which, so ask again with one of them.",
            ),
          platform: z
            .string()
            .optional()
            .describe(
              "Where it was watched, spelled as this catalog spells it — " +
                "catalog_stats lists the ones in use, and a wrong one comes " +
                "back with the full list rather than being guessed at.",
            ),
          on: z.string().optional().describe("When it was watched, as YYYY-MM-DD."),
        }),
      },
      async ({ title, platform, on }) => json(await editWatched(title, platform, on)),
    );
  },
  {
    serverInfo: { name: "cinemory", version: "1.0.0" },
    instructions:
      "This is one person's record of what they have watched and what they plan " +
      "to watch. It is the authority on their own viewing — prefer it over " +
      "assumptions about what they have seen." +
      (allowWrites
        ? " This connector can also add to the watchlist, mark things watched, " +
          "and correct where or when something was watched. It cannot remove " +
          "anything."
        : " It is read-only."),
  },
  );
}

// Built once each, not per request: which one answers is the token's business.
const readHandler = build(false);
const writeHandler = build(true);

/**
 * What a refused request is told, which is not the same on both addresses.
 *
 * On the URL-with-the-token form the address *is* the credential, so a wrong
 * one gets the same 404 as a path that was never routed: a prober cannot tell
 * whether it guessed a real endpoint.
 *
 * The plain address has nothing to hide — it is meant to be pasted into a
 * connector's settings — and there the 404 was actively harmful: it made "your
 * token is missing" indistinguishable from "there is no server here", which is
 * exactly what a client reports back to the reader. So it answers the way RFC
 * 6750 and the MCP spec say to, and the reader is told which of the two it is.
 */
function refuse(isPathForm: boolean, credentialOffered: boolean): Response {
  if (isPathForm) return new Response("Not found", { status: 404 });
  const challenge = credentialOffered
    ? 'Bearer realm="cinemory", error="invalid_token"'
    : 'Bearer realm="cinemory"';
  return new Response(credentialOffered ? "Invalid token." : "Missing token.", {
    status: 401,
    headers: { "WWW-Authenticate": challenge },
  });
}

/**
 * Serves a request against whichever token it carries.
 */
export async function serveMcp(request: Request, tokenFromPath?: string): Promise<Response> {
  // A header beats the path: a client that can send one is using the form
  // worth encouraging, and a stale URL should not quietly outrank it.
  const fromHeader = tokenFromHeaders(request.headers);
  const token = fromHeader ?? tokenFromPath;
  if (!token) return refuse(tokenFromPath !== undefined, false);

  const settings = await prisma.settings.findFirst({ select: { mcpTokenHash: true } });
  if (!isValidMcpToken(token, settings?.mcpTokenHash ?? null)) {
    return refuse(tokenFromPath !== undefined, true);
  }

  // The prefix is part of what was hashed, so a token that got this far is
  // making a claim it cannot have edited.
  return scopeOf(token) === "write" ? writeHandler(request) : readHandler(request);
}
