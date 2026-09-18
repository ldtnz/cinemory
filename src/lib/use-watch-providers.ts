"use client";

import { useEffect, useState } from "react";
import type { CatalogTitle } from "@/lib/catalog-title";

/**
 * Where the titles on screen can be watched right now, for the watchlist.
 *
 * Asked for a screenful at a time rather than for the whole list: a watchlist
 * of two hundred titles would be two hundred TMDB calls to answer a question
 * about the twelve rows someone is looking at. The route caches what it
 * learns for half a day (src/app/api/providers/route.ts), so scrolling back
 * and forth, or opening the app again later, costs nothing.
 *
 * Titles TMDB never matched have no id to ask about and are simply left out.
 */
export function useWatchProviders(titles: CatalogTitle[] | null) {
  const [providers, setProviders] = useState<Record<number, string[]>>({});

  // The set of ids currently on screen, as a stable string: the array itself
  // is new on every render, and scrolling changes its length rather than its
  // contents.
  const wanted = (titles ?? [])
    .filter((t) => t.tmdbId != null && t.tmdbId > 0)
    .map((t) => `${t.mediaType}:${t.tmdbId}`);
  const key = wanted.join(",");

  useEffect(() => {
    if (key === "") return;
    const items = key.split(",").map((entry) => {
      const [mediaType, id] = entry.split(":");
      return { mediaType, tmdbId: Number(id) };
    });

    let current = true;
    void (async () => {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      }).catch(() => null);
      if (!res?.ok || !current) return;
      const data = (await res.json().catch(() => null)) as {
        providers?: Record<number, string[]>;
      } | null;
      if (!current || !data?.providers) return;
      // Merged rather than replaced: what a previous screenful learned stays,
      // so scrolling up does not blank out the rows above.
      setProviders((prev) => ({ ...prev, ...data.providers }));
    })();

    return () => {
      current = false;
    };
  }, [key]);

  return providers;
}
