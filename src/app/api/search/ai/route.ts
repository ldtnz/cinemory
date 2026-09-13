import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnthropicConfigured } from "@/lib/recommendations";

const MAX_QUERY_LENGTH = 200;
// The whole watched half is handed to Claude, capped so a very large catalog
// cannot turn one search into a huge (and slow) request. Most recently
// watched first, since that is what a vague "the one I saw a while back" is
// most likely to be about.
const MAX_CATALOG_ROWS = 2000;
const MAX_RESULTS = 40;

const SearchResultSchema = z.object({
  ids: z.array(z.number()).max(MAX_RESULTS),
});

const INSTRUCTIONS =
  "You are the search box of someone's personal catalog of movies and TV " +
  "series they have watched. Given a free-text query, return the ids of the " +
  "entries it refers to, most relevant first.\n\n" +
  "The query is written the way someone talks to a friend, not the way a " +
  "database is queried: it may be in any language, misspelled or garbled, " +
  "and it may describe a director, an actor, a plot point, a setting, a mood " +
  "or a vague memory rather than a title. Use what you know about these works " +
  "— who directed them, who is in them, what happens in them, what they feel " +
  "like — to decide what matches. The catalog lines only carry title, year, " +
  "type and genres, so most of the judgement has to come from your own " +
  "knowledge of the works themselves.\n\n" +
  "Only ever return ids present in the catalog below. Return an empty list " +
  "when nothing genuinely matches — a wrong answer is worse than none, so do " +
  "not pad the list with loose associations.";

/**
 * Free-text search over the catalog, for when the plain title match finds
 * nothing ("that Nolan one", "il film sul divorzio", "quello con l'orso").
 *
 * Claude is given the catalog and picks the matching rows itself rather than
 * being asked for keywords to grep with: what makes a query like "christopher
 * nolan" work is knowing who directed what, and none of that is in the row —
 * a keyword match over title and overview would find nothing.
 *
 * claude-sonnet-5, like the app's other AI features: this leans on the
 * model's knowledge of films, which is exactly where a smaller model gives
 * noticeably worse answers.
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
    const titles = await prisma.title.findMany({
      where: { inWatchlist: false },
      select: { id: true, title: true, year: true, mediaType: true, genres: true },
      orderBy: { lastWatchedAt: "desc" },
      take: MAX_CATALOG_ROWS,
    });
    if (titles.length === 0) {
      return NextResponse.json({ ids: [] });
    }

    const catalog = titles
      .map(
        (t) =>
          `${t.id}\t${t.title}${t.year ? ` (${t.year})` : ""} · ${t.mediaType}${
            t.genres ? ` · ${t.genres}` : ""
          }`,
      )
      .join("\n");

    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      system: [
        { type: "text", text: INSTRUCTIONS },
        // Cached: the catalog is the bulk of the request and does not change
        // between one search and the next, so a second attempt (or a second
        // query moments later) re-reads it instead of paying for it again.
        {
          type: "text",
          text: `Catalog (id, then title):\n${catalog}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: query }],
      // Recall about known works plus a filter over a list — worth some
      // thinking, but not the depth a recommendation batch gets.
      output_config: { format: zodOutputFormat(SearchResultSchema), effort: "medium" },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return NextResponse.json({ error: "Could not parse the search." }, { status: 500 });
    }
    // Claude can name an id that is not in the catalog; dropping those here
    // means the client never has to defend against it.
    const known = new Set(titles.map((t) => t.id));
    return NextResponse.json({ ids: parsed.ids.filter((id) => known.has(id)) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI search failed." }, { status: 500 });
  }
}
