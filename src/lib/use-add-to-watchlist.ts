"use client";

import { useState } from "react";
import type { Title } from "@prisma/client";
import type { TmdbCandidate } from "@/lib/tmdb";

export type AddState = "idle" | "adding" | "added" | "error";

/**
 * Putting a TMDB candidate on the watchlist, with the little state machine
 * the two places that offer it both need: the discovery grid (DiscoverCard)
 * and the recommendations strip (RecommendationsRow).
 *
 * `alreadySaved` only seeds the initial state — once mounted the hook owns it,
 * so a tile that was just added stays marked as added.
 */
export function useAddToWatchlist(
  alreadySaved: boolean,
  onAdded: (title: Title) => void,
) {
  const [state, setState] = useState<AddState>(alreadySaved ? "added" : "idle");

  async function add(candidate: TmdbCandidate) {
    if (state === "added" || state === "adding") return;
    setState("adding");
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate, watchlist: true }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          title: Title & { lastWatchedAt: string | null; createdAt: string; updatedAt: string };
        };
        // The API speaks JSON, so the dates come back as strings; the catalog
        // state is typed with real Dates and sorts on them.
        onAdded({
          ...data.title,
          lastWatchedAt: data.title.lastWatchedAt ? new Date(data.title.lastWatchedAt) : null,
          createdAt: new Date(data.title.createdAt),
          updatedAt: new Date(data.title.updatedAt),
        });
        setState("added");
        return;
      }
      // 409 means it is already in the catalog — treat it as done rather than
      // as a failure, the outcome the user wanted is already true.
      setState(res.status === 409 ? "added" : "error");
    } catch {
      setState("error");
    }
  }

  return { state, add, done: state === "added" };
}
