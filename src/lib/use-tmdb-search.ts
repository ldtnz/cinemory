"use client";

import { useEffect, useState } from "react";
import type { TmdbCandidate } from "@/lib/tmdb";

export type TmdbSearchState = {
  results: TmdbCandidate[];
  /** True while a search for the current query is in flight, debounce
   *  included — distinct from a plain loading flag so "no results" never
   *  flashes true before the first real answer for this query arrives. */
  searching: boolean;
  error: string | null;
};

/**
 * The debounced TMDB search two different pickers need — "Add title"'s
 * search-as-you-type and the "To watch" discovery grid — which had drifted
 * into two near-identical copies of the same debounce/cancel/state dance
 * (one supporting `perType`, the other not, purely by accident of which one
 * needed it first). One implementation instead, each round cancelling the
 * previous so a slow response can never overwrite a newer one.
 */
export function useTmdbSearch(
  query: string,
  {
    enabled = true,
    perType,
    resetOnEnable = false,
  }: {
    /** Search is skipped entirely while false — the picker is closed, or a
     *  different catalog mode is showing. */
    enabled?: boolean;
    /** A fuller result set than the default short list. */
    perType?: number;
    /** Clear the previous session's results the moment this search becomes
     *  enabled again, instead of leaving them on screen for one more
     *  debounce cycle. Wanted for a picker that reopens fresh each time
     *  (Add title); not wanted for a search that stays mounted and toggles
     *  on/off with it (the discovery grid), where the old results are still
     *  a reasonable thing to show while the identical query re-fetches. */
    resetOnEnable?: boolean;
  } = {},
): TmdbSearchState {
  const [results, setResults] = useState<TmdbCandidate[]>([]);
  // The query the current results belong to. Compared against what is
  // typed, it tells whether a search is still in flight, debounce included.
  // With a plain "loading" flag, the debounce wait would instead show a "no
  // results" that is not true yet.
  const [searchedFor, setSearchedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prevEnabled, setPrevEnabled] = useState(enabled);

  const trimmed = query.trim();

  // Adjusted during render, not in an effect — same shape as
  // useAddToWatchlist's prevAlreadySaved: reacting to a prop change here
  // avoids the extra render pass (and the set-state-in-effect lint rule)
  // an effect version of this would need.
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    if (enabled && resetOnEnable) {
      setResults([]);
      setError(null);
      setSearchedFor(null);
    }
  }

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      if (!trimmed) {
        setResults([]);
        setError(null);
        setSearchedFor("");
        return;
      }
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (perType) params.set("perType", String(perType));
        const res = await fetch(`/api/tmdb-search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { results: TmdbCandidate[] };
        if (cancelled) return;
        setResults(data.results);
        setError(null);
      } catch {
        if (!cancelled) {
          setResults([]);
          setError("Search failed.");
        }
      } finally {
        // On error too: without this it would say "Searching..." forever.
        if (!cancelled) setSearchedFor(trimmed);
      }
    }, trimmed ? 350 : 0);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [enabled, trimmed, perType]);

  return { results, searching: trimmed !== "" && searchedFor !== trimmed, error };
}
