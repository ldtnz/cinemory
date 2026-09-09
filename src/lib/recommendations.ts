// AI-generated "what to watch next" suggestions, backed by Claude.
//
// Cost control is the whole point of this file: a fresh call only ever
// happens through generateRecommendations(), gated by the interval below and
// a DB-backed lock (claimGenerationLock) so an automatic background refresh
// and a manual click can never both call Claude at once. Every generation is
// kept (a new Recommendation row), never overwritten, so there is a history.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { findBestTmdbMatch, getTrailerKey, isTmdbConfigured } from "@/lib/tmdb";

export const REFRESH_INTERVAL_DAYS = 5;
// How long a claimed lock is honored before being treated as abandoned (the
// request that took it crashed or timed out mid-generation) and re-claimable.
const LOCK_STALE_MINUTES = 10;
// 16 gives the "See all" list something to scroll through and divides evenly
// into the recommendations strip's rows of 4. Haiku 4.5 is $1/$5 per MTok
// (input/output): the catalog summary plus 16 short structured entries comes
// to roughly $0.01-0.02 a call, still well inside the 2-5 cents/use budget
// this feature was built to (see generateRecommendations below).
const RECOMMENDATION_COUNT = 16;

export type EnrichedRecommendation = {
  title: string;
  year: number | null;
  mediaType: "Movie" | "Series";
  reason: string;
  tmdbId: number | null;
  posterUrl: string | null;
  tmdbRating: number | null;
  genres: string | null;
  /** YouTube video id for the trailer, if TMDB has one. */
  trailerKey: string | null;
};

export type RecommendationsState = {
  titles: EnrichedRecommendation[];
  generatedAt: string; // ISO
};

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Called from the home page on every load, so a DB problem here must never
// take the whole page down with it — most likely cause is the migration for
// the Recommendation table not having been applied yet (self-hosted and
// Turso deploys need to run it by hand; see scripts/migrate-turso.ts).
export async function getStoredRecommendations(): Promise<RecommendationsState | null> {
  try {
    const row = await prisma.recommendation.findFirst({ orderBy: { generatedAt: "desc" } });
    if (!row) return null;
    return { titles: JSON.parse(row.titles) as EnrichedRecommendation[], generatedAt: row.generatedAt.toISOString() };
  } catch (err) {
    console.error(
      "Could not read stored recommendations — has the Recommendation table migration been applied?",
      err,
    );
    return null;
  }
}

/** The full history of past generations, most recent first. */
export async function getRecommendationHistory(): Promise<RecommendationsState[]> {
  const rows = await prisma.recommendation.findMany({ orderBy: { generatedAt: "desc" } });
  return rows.map((row) => ({
    titles: JSON.parse(row.titles) as EnrichedRecommendation[],
    generatedAt: row.generatedAt.toISOString(),
  }));
}

export function nextRefreshAt(generatedAt: string): Date {
  return new Date(new Date(generatedAt).getTime() + REFRESH_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
}

export function canRefreshNow(generatedAt: string | null): boolean {
  if (!generatedAt) return true;
  return Date.now() >= nextRefreshAt(generatedAt).getTime();
}

/**
 * Claims the right to generate a fresh batch right now, using the Settings
 * row's recommendationsLockedAt as a simple mutex. Returns false if someone
 * else holds a live lock, so callers should skip generating rather than
 * race it. A lock older than LOCK_STALE_MINUTES is treated as abandoned.
 */
export async function claimGenerationLock(): Promise<boolean> {
  await getSettings(); // ensures the singleton row exists before the claim
  const staleBefore = new Date(Date.now() - LOCK_STALE_MINUTES * 60 * 1000);
  const result = await prisma.settings.updateMany({
    where: {
      id: 1,
      OR: [{ recommendationsLockedAt: null }, { recommendationsLockedAt: { lt: staleBefore } }],
    },
    data: { recommendationsLockedAt: new Date() },
  });
  return result.count === 1;
}

export async function releaseGenerationLock(): Promise<void> {
  await prisma.settings.update({ where: { id: 1 }, data: { recommendationsLockedAt: null } }).catch(() => {});
}

/**
 * Called on every home-page load. If the latest batch is missing or older
 * than REFRESH_INTERVAL_DAYS, schedules a fresh generation to run *after*
 * the response is sent (next/server's after()) — this request still renders
 * with whatever is cached, and the new batch is ready for the next visit.
 * Never throws: a failed background refresh should never surface to a user.
 */
export function ensureFreshRecommendationsInBackground(current: RecommendationsState | null): void {
  if (!isAnthropicConfigured()) return;
  if (current && !canRefreshNow(current.generatedAt)) return;

  after(async () => {
    const claimed = await claimGenerationLock().catch(() => false);
    if (!claimed) return; // another request (manual or automatic) is already on it
    try {
      await generateRecommendations();
    } catch (err) {
      console.error("Automatic recommendations refresh failed:", err);
    } finally {
      await releaseGenerationLock();
    }
  });
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
    // Room for 16 structured entries (title/year/mediaType/reason each);
    // 2000 was sized for 8 and would truncate the response now.
    max_tokens: 4000,
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
      // Fetched once here rather than on click, so opening a trailer later
      // never costs an extra request — it's just serving cached history.
      const trailerKey = match ? await getTrailerKey(match.tmdbId, rec.mediaType) : null;
      return {
        title: rec.title,
        year: match?.year ?? rec.year,
        mediaType: rec.mediaType,
        reason: rec.reason,
        tmdbId: match?.tmdbId ?? null,
        posterUrl: match?.posterUrl ?? null,
        tmdbRating: match?.tmdbRating ?? null,
        genres: match?.genres ?? null,
        trailerKey,
      };
    }),
  );

  // Titles TMDB could not confirm are dropped rather than shown without a
  // poster: for a discovery feature, a wrong or missing match is worse than
  // one suggestion fewer.
  const confirmed = enriched.filter((r) => r.tmdbId !== null);

  const generatedAt = new Date();
  await prisma.recommendation.create({
    data: { titles: JSON.stringify(confirmed), generatedAt },
  });

  return { titles: confirmed, generatedAt: generatedAt.toISOString() };
}
