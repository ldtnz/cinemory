"use client";

import { useEffect, useRef, useState } from "react";
import type { CatalogTitle } from "@/lib/catalog-title";
import {
  loadMissingWatchProviders,
  type ProviderCache,
  type ProviderResults,
} from "@/lib/watch-providers";

/** Keep successful checks while scrolling; failed checks can be retried. */
export function useWatchProviders(titles: CatalogTitle[] | null, region: string) {
  const [providers, setProviders] = useState<ProviderResults>({});
  const cache = useRef<ProviderCache>(new Map());
  const [retry, setRetry] = useState(0);
  const key = (titles ?? [])
    .filter((t) => t.tmdbId != null && t.tmdbId > 0)
    .map((t) => `${t.mediaType}:${t.tmdbId}`)
    .join(",");

  useEffect(() => {
    const refresh = () => setRetry((n) => n + 1);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!key) return;
    const items = key.split(",").map((entry) => {
      const [mediaType, id] = entry.split(":");
      return { mediaType, tmdbId: Number(id) };
    });
    const controller = new AbortController();
    void loadMissingWatchProviders(items, region, cache.current, (results) => {
      setProviders((prev) => ({ ...prev, ...results }));
    }, controller.signal);
    return () => controller.abort();
  }, [key, region, retry]);

  return providers;
}
