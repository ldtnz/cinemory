import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";
import { fetchWatchProviders, isTmdbConfigured } from "@/lib/tmdb";
import { getSettings } from "@/lib/settings";
import { PROVIDER_MAX_ITEMS, PROVIDER_TTL_MS, watchProviderKey, type ProviderResults } from "@/lib/watch-providers";

// One TMDB call per title that is not cached; the catalog asks for a screenful
// at a time.
export const maxDuration = 60;

/** How many TMDB calls are in the air at once. */
const CONCURRENCY = 8;
/**
 * TMDB refreshes this from JustWatch daily at most, and a catalog is browsed
 * far more often than that — so the answer is held for half a day. In memory
 * rather than in the database: it is a fact about the world today, not about
 * the title, and a serverless instance that goes away simply asks again.
 */
const TTL_MS = PROVIDER_TTL_MS;

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
  if (!Array.isArray(body?.items) || body.items.length > PROVIDER_MAX_ITEMS) {
    return NextResponse.json({ error: `Send at most ${PROVIDER_MAX_ITEMS} items.` }, { status: 400 });
  }
  const items = body.items.filter((item) =>
    item && Number.isInteger(item.tmdbId) && (item.tmdbId ?? 0) > 0 &&
    (item.mediaType === "Movie" || item.mediaType === "Series"),
  );
  const { region } = await getSettings();
  const providers: ProviderResults = {};
  const seen = new Set<string>();
  const now = Date.now();
  const pending: { tmdbId: number; mediaType: string; key: string }[] = [];

  for (const item of items) {
    const tmdbId = item.tmdbId as number;
    const mediaType = item.mediaType === "Series" ? "Series" : "Movie";
    const key = watchProviderKey(region, { mediaType, tmdbId });
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = cache.get(key);
    if (hit && now - hit.at < TTL_MS) {
      providers[key] = hit.names;
      continue;
    }
    pending.push({ tmdbId, mediaType, key });
  }

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    await Promise.all(
      pending.slice(i, i + CONCURRENCY).map(async ({ tmdbId, mediaType, key }) => {
        try {
          const names = await fetchWatchProviders(tmdbId, mediaType, region);
          // A successful empty answer is cacheable; a failed check is not.
          cache.set(key, { names, at: Date.now() });
          providers[key] = names;
        } catch {
          providers[key] = null;
        }
      }),
    );
  }

  return NextResponse.json({ region, providers });
}
