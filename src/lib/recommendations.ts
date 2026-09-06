// AI-generated "what to watch next" suggestions, backed by Claude.
//
// Cost control is the whole point of this file: a fresh call only ever
// happens through generateRecommendations(), gated by the cooldown below and
// enforced server-side in the API route (never just in the UI) — repeat
// views always serve the cached row instead.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { findBestTmdbMatch, isTmdbConfigured } from "@/lib/tmdb";

const RECOMMENDATION_ID = 1;
export const COOLDOWN_HOURS = 24;
const RECOMMENDATION_COUNT = 8;

export type EnrichedRecommendation = {
  title: string;
  year: number | null;
  mediaType: "Movie" | "Series";
  reason: string;
  tmdbId: number | null;
  posterUrl: string | null;
  tmdbRating: number | null;
  genres: string | null;
};

export type RecommendationsState = {
  titles: EnrichedRecommendation[];
  generatedAt: string; // ISO
};

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function getStoredRecommendations(): Promise<RecommendationsState | null> {
  const row = await prisma.recommendation.findUnique({ where: { id: RECOMMENDATION_ID } });
  if (!row) return null;
  return { titles: JSON.parse(row.titles) as EnrichedRecommendation[], generatedAt: row.generatedAt.toISOString() };
}

export function nextRefreshAt(generatedAt: string): Date {
  return new Date(new Date(generatedAt).getTime() + COOLDOWN_HOURS * 60 * 60 * 1000);
}

export function canRefreshNow(generatedAt: string | null): boolean {
  if (!generatedAt) return true;
  return Date.now() >= nextRefreshAt(generatedAt).getTime();
}

const RecommendationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        year: z.number().nullable(),
        mediaType: z.enum(["Movie", "Series"]),
        reason: z.string(),
      }),
    )
    .length(RECOMMENDATION_COUNT),
});

/**
 * A compact summary of the catalog: aggregate taste signals plus the full
 * list of titles already owned (as bare strings, cheap even for a large
 * catalog) so Claude never re-suggests something already there.
 */
async function buildCatalogSummary() {
  const titles = await prisma.title.findMany({
    select: {
      title: true,
      platform: true,
      genres: true,
      tmdbRating: true,
      personalRating: true,
    },
    orderBy: { lastWatchedAt: "desc" },
  });

  const genreCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  for (const t of titles) {
    for (const g of (t.genres ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
    }
    platformCounts.set(t.platform, (platformCounts.get(t.platform) ?? 0) + 1);
  }
  const topGenres = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g);
  const topPlatforms = [...platformCounts.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const recentlyWatched = titles.slice(0, 40).map((t) => t.title);
  const highlyRated = titles
    .filter((t) => (t.personalRating ?? t.tmdbRating ?? 0) >= 7.5)
    .slice(0, 20)
    .map((t) => t.title);
  const allTitles = titles.map((t) => t.title);

  return { topGenres, topPlatforms, recentlyWatched, highlyRated, allTitles };
}

export async function generateRecommendations(): Promise<RecommendationsState> {
  const summary = await buildCatalogSummary();

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-haiku-4-5",
    max_tokens: 2000,
    system:
      "You recommend movies and TV series for someone to watch next, based on " +
      "their watch history. Only suggest real, well-known titles that actually " +
      "exist — never invent one. Never suggest a title already in their " +
      "catalog. Keep each reason to one short, specific sentence.",
    messages: [
      {
        role: "user",
        content: [
          `Favorite genres: ${summary.topGenres.join(", ") || "unknown"}`,
          `Streaming platforms used: ${summary.topPlatforms.join(", ") || "unknown"}`,
          `Recently watched: ${summary.recentlyWatched.join("; ") || "none"}`,
          `Rated highly by them: ${summary.highlyRated.join("; ") || "none"}`,
          `Already in their catalog — do not recommend any of these: ${summary.allTitles.join("; ") || "none"}`,
          `Suggest exactly ${RECOMMENDATION_COUNT} movies or TV series they would likely enjoy next.`,
        ].join("\n\n"),
      },
    ],
    output_config: { format: zodOutputFormat(RecommendationSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Claude did not return valid recommendations.");

  const enriched = await Promise.all(
    parsed.recommendations.map(async (rec): Promise<EnrichedRecommendation> => {
      const match = isTmdbConfigured() ? await findBestTmdbMatch(rec.title, rec.mediaType) : null;
      return {
        title: rec.title,
        year: match?.year ?? rec.year,
        mediaType: rec.mediaType,
        reason: rec.reason,
        tmdbId: match?.tmdbId ?? null,
        posterUrl: match?.posterUrl ?? null,
        tmdbRating: match?.tmdbRating ?? null,
        genres: match?.genres ?? null,
      };
    }),
  );

  // Titles TMDB could not confirm are dropped rather than shown without a
  // poster: for a discovery feature, a wrong or missing match is worse than
  // one suggestion fewer.
  const confirmed = enriched.filter((r) => r.tmdbId !== null);

  const generatedAt = new Date();
  await prisma.recommendation.upsert({
    where: { id: RECOMMENDATION_ID },
    update: { titles: JSON.stringify(confirmed), generatedAt },
    create: { id: RECOMMENDATION_ID, titles: JSON.stringify(confirmed), generatedAt },
  });

  return { titles: confirmed, generatedAt: generatedAt.toISOString() };
}
