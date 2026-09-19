import { tmdbIdentity } from "@/lib/title-identity";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAnthropicConfigured } from "@/lib/recommendations";
import { findBestTmdbMatch, isTmdbConfigured, type TmdbCandidate } from "@/lib/tmdb";
import { normalizeTitle } from "@/lib/title-key";

// One TMDB lookup per title in watchlist mode, on top of the Claude call —
// past what the default limit allows, same as the import routes.
export const maxDuration = 60;

const MAX_QUERY_LENGTH = 200;
// How many works Claude may name for one query. Also the cap on the OR query
// built from them below.
const MAX_CANDIDATES = 40;
// Watchlist mode resolves each name against TMDB, one request apiece, so it
// works from a much shorter list than the catalog match does.
const MAX_DISCOVER = 12;
// Below this length a candidate has to match a catalog title exactly: a
// "contains" match on something as short as "Up" or "Her" would drag in half
// the catalog.
const MIN_PARTIAL_LENGTH = 6;

const CandidatesSchema = z.object({
  titles: z
    .array(
      z.object({
        title: z.string(),
        mediaType: z.enum(["Movie", "Series"]),
      }),
    )
    .max(MAX_CANDIDATES),
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
  "extra words, and say whether it is a Movie or a Series. Only name real " +
  "works. You are not being shown their catalog, so name everything the query " +
  "plausibly refers to and let the app work out which of them are theirs — but " +
  "stay on the query: an empty list is better than a list of loose " +
  "associations.";

/**
 * Free-text search, for queries a title match cannot answer ("that Nolan
 * one", "il film sul divorzio", "quello con l'orso").
 *
 * Claude's job is the same in both modes — name the works a query points at,
 * which it can do without being shown anything. What differs is where the
 * names are then looked up: "watched" matches them against the catalog and
 * answers with row ids, "watchlist" resolves them through TMDB and answers
 * with candidates to add, since that half of the app is about finding
 * something new rather than finding something again.
 *
 * The catalog never goes into the prompt. An earlier version did hand Claude
 * the whole thing to pick from — it worked, but at ~57k input tokens a search
 * it cost about a hundred times this one.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as
    | { query?: string; mode?: string }
    | null;
  const query = body?.query?.trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) {
    return NextResponse.json({ error: "Missing query." }, { status: 400 });
  }
  const wantsCandidates = body?.mode === "watchlist";
  if (wantsCandidates && !isTmdbConfigured()) {
    return NextResponse.json({ error: "TMDB is not configured." }, { status: 500 });
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

    if (parsed.titles.length === 0) {
      return NextResponse.json(wantsCandidates ? { candidates: [] } : { ids: [] });
    }

    // "To watch": the names are looked up on TMDB instead, so what comes back
    // is something addable — poster, id and all — rather than a row that,
    // by definition, is not in the catalog yet.
    if (wantsCandidates) {
      const resolved = await Promise.all(
        parsed.titles
          .slice(0, MAX_DISCOVER)
          .map((t) => findBestTmdbMatch(t.title, t.mediaType).catch(() => null)),
      );
      const seen = new Set<string>();
      const candidates = resolved.filter((c): c is TmdbCandidate => {
        if (!c) return false;
        const key = tmdbIdentity(c)!;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return NextResponse.json({ candidates });
    }

    // Matched on the same normalized form every other title lookup in the app
    // uses (Title.searchTitle, which is indexed). "contains" rather than
    // equality so a catalog row keeps matching when it carries a subtitle
    // Claude left off — "The Lord of the Rings: The Fellowship of the Ring"
    // for "The Fellowship of the Ring".
    const candidates = [
      ...new Set(parsed.titles.map((t) => normalizeTitle(t.title)).filter(Boolean)),
    ].slice(0, MAX_CANDIDATES);
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
