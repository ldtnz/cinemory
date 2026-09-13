import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { isAnthropicConfigured } from "@/lib/recommendations";
import { PLATFORMS } from "@/lib/platforms";

const MAX_QUERY_LENGTH = 200;

const SearchFiltersSchema = z.object({
  genre: z.string().nullable(),
  platform: z.string().nullable(),
  mediaType: z.enum(["Movie", "Series"]).nullable(),
  keywords: z.array(z.string()).max(6),
});

/**
 * Turns a free-text query ("that psychological thriller with the twist
 * ending I watched last year") into filters the catalog already knows how
 * to apply — the genre/platform/media type pickers, plus a short list of
 * keywords the client matches against each title and its overview.
 *
 * claude-haiku-4-5, not claude-sonnet-5 like the rest of the AI features in
 * this app: this is pure intent extraction (a few hundred tokens in, a
 * handful out), not generation, so the cheaper and faster model is the
 * better fit here.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isAnthropicConfigured()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as
    | { query?: string; availableGenres?: string[] }
    | null;
  const query = body?.query?.trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) {
    return NextResponse.json({ error: "Missing query." }, { status: 400 });
  }
  const availableGenres = Array.isArray(body?.availableGenres)
    ? body.availableGenres.filter((g): g is string => typeof g === "string").slice(0, 100)
    : [];

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system:
        "You turn a free-text search over someone's personal movie/TV catalog into " +
        "structured filters. genre must be exactly one of the provided list, or null " +
        "if none fits. platform must be exactly one of the provided list, or null. " +
        "mediaType is Movie, Series, or null if the query does not imply one. keywords " +
        "are up to 6 short English words or phrases (plot elements, mood, setting, " +
        "character or actor names) to match against the title and its English-language " +
        "synopsis — translate them to English even if the query is in another language. " +
        "Leave a field null or empty rather than guessing when the query gives no signal " +
        "for it.",
      messages: [
        {
          role: "user",
          content: [
            `Query: "${query}"`,
            `Genres in this catalog: ${availableGenres.join(", ") || "none"}`,
            `Platforms: ${PLATFORMS.map((p) => p.value).join(", ")}`,
          ].join("\n\n"),
        },
      ],
      output_config: { format: zodOutputFormat(SearchFiltersSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return NextResponse.json({ error: "Could not parse the search." }, { status: 500 });
    }
    return NextResponse.json(parsed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI search failed." }, { status: 500 });
  }
}
