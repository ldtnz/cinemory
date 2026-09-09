"use client";

import { useState } from "react";
import type { Title } from "@prisma/client";
import type { TmdbCandidate } from "@/lib/tmdb";

export type AddState = "idle" | "adding" | "added" | "error";

/**
 * Putting a TMDB candidate on the watchlist, with the little state machine
 * every place that offers it needs: the discovery grid (DiscoverCard), the
 * recommendations strip (RecommendationsRow) and the "see all" modal
 * (RecommendationsModal).
 *
 * `alreadySaved` seeds the initial state and is also tracked afterwards: if
 * the title is later removed from the catalog elsewhere (deleted, or moved
 * back off the watchlist), `alreadySaved` flips to false and the button
 * resets to idle instead of staying stuck on "added" until the page reloads.
 * Skipped while a request is in flight, so a race with the fetch this hook
 * itself just started can't stomp on it.
 *
 * Adjusted during render, not in an effect — React's own guidance for
 * "reset state when a prop changes": a `prevAlreadySaved` ref-as-state
 * catches the change on the same render instead of the effect's extra pass.
 */
export function useAddToWatchlist(
  alreadySaved: boolean,
  onAdded: (title: Title) => void,
) {
  const [state, setState] = useState<AddState>(alreadySaved ? "added" : "idle");
  const [prevAlreadySaved, setPrevAlreadySaved] = useState(alreadySaved);

  if (alreadySaved !== prevAlreadySaved) {
    setPrevAlreadySaved(alreadySaved);
    if (state !== "adding") setState(alreadySaved ? "added" : "idle");
  }

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
