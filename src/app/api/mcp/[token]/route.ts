/**
 * The MCP endpoint: Cinemory as a custom connector in Claude.
 *
 * Added on claude.ai under Customize -> Connectors -> Add custom connector,
 * with the URL the settings page hands out. Anthropic's servers fetch this,
 * not the reader's browser, which is why it is reachable without a session
 * cookie and why the token sits in the path — a connector stores a URL, and
 * that is the whole of what it stores.
 *
 * Read-only by design. Every tool here answers a question; none of them change
 * anything, so the worst an escaped URL can do is disclose a film collection.
 */
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidMcpToken } from "@/lib/mcp-token";
import {
  MAX_RESULTS,
  catalogStats,
  recentlyWatched,
  searchCatalog,
  watchlist,
} from "@/lib/mcp-catalog";

// Several of these read the whole catalog to count it.
export const maxDuration = 60;

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

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_catalog",
      {
        title: "Search the catalog",
        description:
          "Search what the user has watched or has waiting. Use this to answer " +
          "'have I seen X?', 'what have I watched by/about X?', and anything " +
          "filtered by genre or by film vs series. Omit the query to browse by " +
          "filter alone.",
        inputSchema: z.object({
          query: z.string().optional().describe("Part of a title. Case and punctuation do not matter."),
          status: z
            .enum(["watched", "watchlist", "any"])
            .optional()
            .describe("Watched titles, the to-watch list, or both. Defaults to both."),
          mediaType: z.enum(["Movie", "Series"]).optional(),
          genre: z.string().optional().describe("A single genre, e.g. Drama."),
          limit,
        }),
      },
      async (args) => json(await searchCatalog(args)),
    );

    server.registerTool(
      "catalog_stats",
      {
        title: "Catalog statistics",
        description:
          "Totals and breakdowns for the whole catalog: how many titles, films " +
          "against series, seasons watched, top platforms and genres, busiest " +
          "years, and the first and most recent thing watched.",
        inputSchema: z.object({}),
      },
      async () => json(await catalogStats()),
    );

    server.registerTool(
      "watchlist",
      {
        title: "The to-watch list",
        description: "Titles the user has saved to watch but has not watched yet, newest first.",
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
        inputSchema: z.object({ limit }),
      },
      async ({ limit }) => json({ titles: await recentlyWatched(limit) }),
    );
  },
  {
    serverInfo: { name: "cinemory", version: "1.0.0" },
    instructions:
      "This is one person's record of what they have watched and what they plan " +
      "to watch. It is the authority on their own viewing — prefer it over " +
      "assumptions about what they have seen.",
  },
);

async function authorized(token: string): Promise<boolean> {
  const settings = await prisma.settings.findFirst({ select: { mcpTokenHash: true } });
  return isValidMcpToken(token, settings?.mcpTokenHash ?? null);
}

async function guard(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  // The same answer whether the endpoint was never switched on or the token is
  // wrong: a 404 tells a prober nothing about which it was.
  if (!(await authorized(token))) {
    return new Response("Not found", { status: 404 });
  }
  return handler(request);
}

export { guard as GET, guard as POST, guard as DELETE };
