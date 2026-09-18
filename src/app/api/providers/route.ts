import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { fetchWatchProviders, isTmdbConfigured } from "@/lib/tmdb";

// One TMDB call per title that is not cached; the catalog asks for a screenful
// at a time.
export const maxDuration = 60;

/** Asking for more than a screenful at once is a mistake, not a use case. */
const MAX_ITEMS = 120;
/** How many TMDB calls are in the air at once. */
const CONCURRENCY = 8;
/**
 * TMDB refreshes this from JustWatch daily at most, and a catalog is browsed
 * far more often than that — so the answer is held for half a day. In memory
 * rather than in the database: it is a fact about the world today, not about
 * the title, and a serverless instance that goes away simply asks again.
 */
const TTL_MS = 12 * 60 * 60 * 1000;

const cache = new Map<string, { names: string[]; at: number }>();

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!isTmdbConfigured()) {
    return NextResponse.json({ error: "TMDB is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    items?: { tmdbId?: number; mediaType?: string }[];
  } | null;
  const items = (body?.items ?? [])
    .filter((i) => typeof i.tmdbId === "number" && i.tmdbId > 0)
    .slice(0, MAX_ITEMS);

  const providers: Record<number, string[]> = {};
  const now = Date.now();
  const pending: { tmdbId: number; mediaType: string; key: string }[] = [];

  for (const item of items) {
    const tmdbId = item.tmdbId as number;
    const mediaType = item.mediaType === "Series" ? "Series" : "Movie";
    const key = `${mediaType}:${tmdbId}`;
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) {
      providers[tmdbId] = hit.names;
      continue;
    }
    pending.push({ tmdbId, mediaType, key });
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(
      pending.slice(i, i + CONCURRENCY).map(async ({ tmdbId, mediaType, key }) => {
        const names = await fetchWatchProviders(tmdbId, mediaType).catch(() => []);
        // Cached even when empty: "nowhere, for now" is an answer worth not
        // asking for again on every scroll.
        cache.set(key, { names, at: Date.now() });
        providers[tmdbId] = names;
      }),
    );
  }

  return NextResponse.json({ providers });
}
