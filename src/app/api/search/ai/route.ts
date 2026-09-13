import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnthropicConfigured } from "@/lib/recommendations";
import { normalizeTitle } from "@/lib/title-key";

const MAX_QUERY_LENGTH = 200;
// How many works Claude may name for one query. Also the cap on the OR query
// built from them below.
const MAX_CANDIDATES = 40;
// Below this length a candidate has to match a catalog title exactly: a
// "contains" match on something as short as "Up" or "Her" would drag in half
// the catalog.
const MIN_PARTIAL_LENGTH = 6;

const CandidatesSchema = z.object({
  titles: z.array(z.string()).max(MAX_CANDIDATES),
});

const INSTRUCTIONS =
  "Someone is searching their personal catalog of movies and TV series for " +
  "something they have watched. Given their query, name the works it refers " +
  "to — most likely first, at most " +
  MAX_CANDIDATES +
  ".\n\n" +
  "The query is written the way someone talks to a friend, not the way a " +
  "database is queried: it may be in any language, misspelled or garbled, and " +
  "it may describe a director, an actor, a plot point, a setting, a mood or a " +
  "vague memory rather than a title. Answer from what you know about films and " +
  "television: for a director or actor, name their notable works; for a " +
  "description, name the works that fit it.\n\n" +
  "Give each title in English, spelled as it is on TMDB, with no year and no " +
  "extra words. Only name real works. You are not being shown their catalog, " +
  "so name everything the query plausibly refers to and let the app work out " +
  "which of them they actually watched — but stay on the query: an empty list " +
  "is better than a list of loose associations.";

/**
 * Free-text search over the catalog, for when the plain title match finds
 * nothing ("that Nolan one", "il film sul divorzio", "quello con l'orso").
 *
 * The work Claude does here is naming the films a query points at, which it
 * can do without being shown anything: the catalog never goes into the
 * prompt, and the matching against it is a plain indexed query below. An
 * earlier version did hand Claude the whole catalog to pick from — it worked,
 * but at ~57k input tokens a search it cost about a hundred times this one.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { query?: string } | null;
  const query = body?.query?.trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) {
    return NextResponse.json({ error: "Missing query." }, { status: 400 });
  }

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: query }],
      // Recall about known works, not reasoning — the depth costs latency on
      // something typed into a search box, and buys nothing here.
      output_config: { format: zodOutputFormat(CandidatesSchema), effort: "low" },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return NextResponse.json({ error: "Could not parse the search." }, { status: 500 });
    }

    // Matched on the same normalized form every other title lookup in the app
    // uses (Title.searchTitle, which is indexed). "contains" rather than
    // equality so a catalog row keeps matching when it carries a subtitle
    // Claude left off — "The Lord of the Rings: The Fellowship of the Ring"
    // for "The Fellowship of the Ring".
    const candidates = [...new Set(parsed.titles.map(normalizeTitle).filter(Boolean))].slice(
      0,
      MAX_CANDIDATES,
    );
    if (candidates.length === 0) {
      return NextResponse.json({ ids: [] });
    }

    // Order is left to the client, which sorts every result set by whatever
    // the sort picker says.
    const matches = await prisma.title.findMany({
      where: {
        inWatchlist: false,
        OR: candidates.map((c) =>
          c.length >= MIN_PARTIAL_LENGTH ? { searchTitle: { contains: c } } : { searchTitle: c },
        ),
      },
      select: { id: true },
    });

    return NextResponse.json({ ids: matches.map((m) => m.id) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI search failed." }, { status: 500 });
  }
}
