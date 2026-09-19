/** Shared identity and result contract for streaming availability. */
export type ProviderTitle = { tmdbId: number; mediaType: string };
/** [] means a successful check with no providers; null means the check failed. */
export type ProviderResults = Record<string, string[] | null>;
export type ProviderResponse = { region: string; providers: ProviderResults };
export const PROVIDER_BATCH_SIZE = 60;
export const PROVIDER_MAX_ITEMS = 120;
export const PROVIDER_TTL_MS = 12 * 60 * 60 * 1000;

export function watchProviderKey(region: string, title: ProviderTitle): string {
  return `${region}:${title.mediaType}:${title.tmdbId}`;
}

type CachedProviders = { names: string[]; at: number };
export type ProviderCache = Map<string, CachedProviders>;

/** Fetch only missing or expired titles, in bounded batches even as the grid grows. */
export async function loadMissingWatchProviders(
  titles: ProviderTitle[],
  region: string,
  cache: ProviderCache,
  publish: (results: ProviderResults) => void,
  signal: AbortSignal,
): Promise<void> {
  const unique = new Map(titles.map((title) => [watchProviderKey(region, title), title]));
  const pending = [...unique].filter(([key]) => {
    const hit = cache.get(key);
    return !hit || Date.now() - hit.at >= PROVIDER_TTL_MS;
  }).map(([, title]) => title);

  for (let i = 0; i < pending.length && !signal.aborted; i += PROVIDER_BATCH_SIZE) {
    const items = pending.slice(i, i + PROVIDER_BATCH_SIZE);
    let data: ProviderResponse | null = null;
    try {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
        signal,
      });
      if (response.ok) data = await response.json();
    } catch {
      // Failed checks are published, but never cached as an empty answer.
    }
    if (signal.aborted) return;
    const results: ProviderResults = {};
    for (const title of items) {
      const key = watchProviderKey(region, title);
      const names = data?.region === region ? data.providers?.[key] : null;
      if (Array.isArray(names) && names.every((name) => typeof name === "string")) {
        cache.set(key, { names, at: Date.now() });
        results[key] = names;
      } else {
        results[key] = null;
      }
    }
    publish(results);
  }
}
