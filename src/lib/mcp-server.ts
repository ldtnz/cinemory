/**
 * The MCP endpoint: Cinemory as a custom connector in Claude.
 *
 * Added on claude.ai under Customize -> Connectors -> Add custom connector,
 * with what the settings page hands out. Anthropic's servers fetch this, not
 * the reader's browser, which is why it is reachable without a session cookie
 * and needs a credential of its own.
 *
 * That credential arrives one of two ways. An Authorization: Bearer header is
 * the better one and what the MCP spec expects — the URL stays a plain, stable
 * address, and the secret stays out of browser history, referrers and anything
 * that logs a path. A client with nowhere to put a header can instead use a URL
 * with the token in it; both are checked the same way, and the settings page
 * hands out both forms.
 *
 * Read-only unless the URL says otherwise. A token generated with writes
 * enabled reaches two more tools, both additive: adding to the watchlist and
 * moving something out of it. Nothing here deletes or edits, so even the wider
 * URL cannot destroy anything — it can only add rows that are visible in the
 * app and removable there.
 *
 * Which tools exist is decided by the token, not checked inside them: two
 * handlers are built, and the scope picks one. A read-only connector is never
 * even told the write tools are there.
 */
import { createMcpHandler } from "mcp-handler";
import { prisma } from "@/lib/prisma";
import { bearerToken, isValidMcpToken, scopeOf } from "@/lib/mcp-token";
import { z } from "zod";
import {
  MAX_RESULTS,
  addToWatchlist,
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
  },
  {
    serverInfo: { name: "cinemory", version: "1.0.0" },
    instructions:
      "This is one person's record of what they have watched and what they plan " +
      "to watch. It is the authority on their own viewing — prefer it over " +
      "assumptions about what they have seen." +
      (allowWrites
        ? " This connector can also add to the watchlist and mark things watched."
        : " It is read-only."),
  },
  );
}

// Built once each, not per request: which one answers is the token's business.
const readHandler = build(false);
const writeHandler = build(true);

/**
 * Serves a request against whichever token it carries.
 *
 * The same 404 whether the endpoint was never switched on, the token is wrong,
 * or none was sent at all: a prober learns nothing about which it was.
 */
export async function serveMcp(request: Request, tokenFromPath?: string): Promise<Response> {
  // A header beats the path: a client that can send one is using the form
  // worth encouraging, and a stale URL should not quietly outrank it.
  const token = bearerToken(request.headers.get("authorization")) ?? tokenFromPath;
  if (!token) return new Response("Not found", { status: 404 });

  const settings = await prisma.settings.findFirst({ select: { mcpTokenHash: true } });
  if (!isValidMcpToken(token, settings?.mcpTokenHash ?? null)) {
    return new Response("Not found", { status: 404 });
  }

  // The prefix is part of what was hashed, so a token that got this far is
  // making a claim it cannot have edited.
  return scopeOf(token) === "write" ? writeHandler(request) : readHandler(request);
}
