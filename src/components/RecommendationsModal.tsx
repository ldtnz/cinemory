"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Play, Plus, ThumbsDown, X } from "lucide-react";
import type { Title } from "@prisma/client";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import { recommendationToCandidate } from "@/lib/recommendation-candidate";
import { normalizeTitle } from "@/lib/title-key";
import { useAddToWatchlist } from "@/lib/use-add-to-watchlist";
import { useDismissRecommendation } from "@/lib/use-dismiss-recommendation";
import TrailerModal from "@/components/TrailerModal";

/** The small square button on each row: adds the recommendation to the
 *  watchlist. Its own component, not inlined into the row below, because it
 *  needs its own useAddToWatchlist state per recommendation. */
function AddButton({
  rec,
  alreadySaved,
  onAdded,
}: {
  rec: EnrichedRecommendation;
  alreadySaved: boolean;
  onAdded: (title: Title) => void;
}) {
  const { state, add, done } = useAddToWatchlist(alreadySaved, onAdded);

  return (
    <button
      type="button"
      onClick={() => add(recommendationToCandidate(rec))}
      disabled={done || state === "adding"}
      aria-label={done ? `${rec.title} is on your watchlist` : `Add ${rec.title} to your watchlist`}
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg transition-colors disabled:cursor-default ${
        done ? "bg-accent-2/20 text-accent-2" : "bg-surface text-muted hover:text-foreground"
      }`}
    >
      {done ? (
        <Check className="h-4 w-4" strokeWidth={2.4} />
      ) : state === "adding" ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
      ) : (
        <Plus className="h-4 w-4" strokeWidth={2.2} />
      )}
    </button>
  );
}

/** The row's other action: "not interested" — excludes it from what's
 *  shown from now on. No done/disabled state to preserve here (unlike
 *  AddButton): a successful dismiss removes the whole row instead. */
function DismissButton({
  rec,
  onDismissed,
}: {
  rec: EnrichedRecommendation;
  onDismissed: (rec: EnrichedRecommendation) => void;
}) {
  const { dismissing, dismiss } = useDismissRecommendation(rec, onDismissed);

  return (
    <button
      type="button"
      onClick={dismiss}
      disabled={dismissing}
      aria-label={`Not interested in ${rec.title}`}
      title="Not interested"
      className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-surface text-muted transition-colors hover:text-foreground disabled:cursor-default"
    >
      {dismissing ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
      ) : (
        <ThumbsDown className="h-3.5 w-3.5" strokeWidth={2} />
      )}
    </button>
  );
}

export default function RecommendationsModal({
  titles,
  onClose,
  onAdded,
  onDismissed,
  savedTmdbIds,
  savedTitleKeys,
}: {
  titles: EnrichedRecommendation[];
  onClose: () => void;
  /** Adding to the watchlist straight from a row — omitted, the "+" button
   *  simply doesn't render, which is the case only if a future caller has no
   *  use for it; both current callers pass it. */
  onAdded?: (title: Title) => void;
  /** "Not interested" — omitted, same as onAdded, hides the button rather
   *  than rendering one with nothing to call. */
  onDismissed?: (rec: EnrichedRecommendation) => void;
  /** TMDB ids already in the catalog, watched or waiting. */
  savedTmdbIds?: Set<number>;
  /** Normalized titles already in the catalog, for the rows TMDB never matched. */
  savedTitleKeys?: Set<string>;
}) {
  const [mounted, setMounted] = useState(false);
  // Set while a trailer is open; closing it clears this and returns to the
  // list rather than closing the whole modal.
  const [trailerFor, setTrailerFor] = useState<EnrichedRecommendation | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // While a trailer is open, its own Escape handler closes just that —
      // this one would otherwise also fire and close the whole list.
      if (e.key === "Escape" && !trailerFor) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, trailerFor]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <h2 className="text-sm font-semibold">Recommended for you</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
          {titles.map((rec) => {
            const hasTrailer = Boolean(rec.trailerKey);
            return (
              <li key={rec.tmdbId} className="flex w-full gap-3 rounded-2xl bg-surface-2 p-2.5">
                <button
                  type="button"
                  onClick={() => hasTrailer && setTrailerFor(rec)}
                  disabled={!hasTrailer}
                  className={`relative h-24 w-16 flex-none overflow-hidden rounded-lg bg-surface text-left ${
                    hasTrailer ? "transition-colors hover:brightness-110" : "cursor-default"
                  }`}
                >
                  {rec.posterUrl && (
                    <Image
                      src={rec.posterUrl}
                      alt={rec.title}
                      fill
                      unoptimized
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                  {hasTrailer && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="h-5 w-5 fill-white text-white" strokeWidth={0} />
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-1 py-0.5">
                  <p className="text-sm font-medium text-foreground">{rec.title}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <span>{rec.mediaType}</span>
                    {rec.year && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{rec.year}</span>
                      </>
                    )}
                    {rec.tmdbRating ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="text-amber-400">★ {rec.tmdbRating.toFixed(1)}</span>
                      </>
                    ) : null}
                  </div>
                  <p className="text-[11px] leading-snug text-muted/80">{rec.reason}</p>
                </div>
                {(onAdded || onDismissed) && (
                  <div className="flex flex-none flex-col gap-1.5 self-center">
                    {onAdded && (
                      <AddButton
                        rec={rec}
                        alreadySaved={
                          (rec.tmdbId != null &&
                            rec.tmdbId > 0 &&
                            (savedTmdbIds?.has(rec.tmdbId) ?? false)) ||
                          (savedTitleKeys?.has(normalizeTitle(rec.title)) ?? false)
                        }
                        onAdded={onAdded}
                      />
                    )}
                    {onDismissed && <DismissButton rec={rec} onDismissed={onDismissed} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {trailerFor?.trailerKey && (
        <TrailerModal
          trailerKey={trailerFor.trailerKey}
          title={trailerFor.title}
          onClose={() => setTrailerFor(null)}
        />
      )}
    </div>,
    document.body,
  );
}
