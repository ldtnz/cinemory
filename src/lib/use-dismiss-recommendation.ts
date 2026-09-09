"use client";

import { useState } from "react";
import type { EnrichedRecommendation } from "@/lib/recommendations";

/**
 * "Not interested" on a recommendation: posts the dismissal, then hands the
 * row back to the caller to remove from whatever list it came from — the
 * strip, the modal, or both at once, since they share one source of truth
 * in Catalog's `recs` state.
 */
export function useDismissRecommendation(
  rec: EnrichedRecommendation,
  onDismissed: (rec: EnrichedRecommendation) => void,
) {
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState(false);

  async function dismiss() {
    if (dismissing) return;
    setDismissing(true);
    setError(false);
    try {
      const res = await fetch("/api/recommendations/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId: rec.tmdbId, title: rec.title, mediaType: rec.mediaType }),
      });
      if (!res.ok) throw new Error();
      onDismissed(rec);
      // No need to reset `dismissing`: the row unmounts once removed from
      // the parent's list.
    } catch {
      setDismissing(false);
      setError(true);
    }
  }

  return { dismissing, error, dismiss };
}
