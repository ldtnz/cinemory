"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Play, Plus, Sparkles, ThumbsDown } from "lucide-react";
import type { Title } from "@prisma/client";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import { recommendationToCandidate } from "@/lib/recommendation-candidate";
import { useAddToWatchlist } from "@/lib/use-add-to-watchlist";
import { useDismissRecommendation } from "@/lib/use-dismiss-recommendation";
import { normalizeTitle } from "@/lib/title-key";
import RecommendationsModal from "@/components/RecommendationsModal";
import TrailerModal from "@/components/TrailerModal";

function Tile({
  rec,
  alreadySaved,
  onAdded,
  onDismissed,
}: {
  rec: EnrichedRecommendation;
  alreadySaved: boolean;
  onAdded: (title: Title) => void;
  onDismissed: (rec: EnrichedRecommendation) => void;
}) {
  const { state, add, done } = useAddToWatchlist(alreadySaved, onAdded);
  const { dismissing, error: dismissError, dismiss } = useDismissRecommendation(rec, onDismissed);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const hasTrailer = Boolean(rec.trailerKey);

  return (
    <li className="w-[104px] flex-none snap-start sm:w-[124px]">
      {/* Two independent buttons stacked on the poster, not one button doing
          both jobs: the add button used to live inside the same element the
          center hover-overlay controlled, so hovering the poster to reveal
          the trailer icon also hid the add button underneath it. Center is
          always the trailer, the corner is always add — neither depends on
          the other's hover state. */}
      <div className="group relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2">
        {rec.posterUrl ? (
          <Image
            src={rec.posterUrl}
            alt={rec.title}
            fill
            unoptimized
            sizes="124px"
            className="pointer-events-none object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-2 text-center">
            <span className="line-clamp-4 text-[10px] leading-tight text-muted">{rec.title}</span>
          </span>
        )}

        {hasTrailer && (
          <button
            type="button"
            onClick={() => setTrailerOpen(true)}
            aria-label={`Watch the trailer for ${rec.title}`}
            className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-150 hover:bg-black/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              <Play className="h-4 w-4 fill-white text-white" strokeWidth={0} />
            </span>
          </button>
        )}

        {/* Both placed after the trailer button in the DOM, so on their
            corners they paint on top and get the click — no z-index needed.
            Two different corners, so they never fight each other either. */}
        <button
          type="button"
          onClick={dismiss}
          disabled={dismissing}
          aria-label={`Not interested in ${rec.title}`}
          title="Not interested"
          className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 transition-opacity duration-150 hover:bg-black/85 group-hover:opacity-100 focus-visible:opacity-100 disabled:cursor-default"
        >
          {dismissing ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          ) : (
            <ThumbsDown className="h-3.5 w-3.5" strokeWidth={2.2} />
          )}
        </button>

        <button
          type="button"
          onClick={() => add(recommendationToCandidate(rec))}
          disabled={done}
          aria-label={
            done ? `${rec.title} is on your watchlist` : `Add ${rec.title} to your watchlist`
          }
          className={`absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg text-white transition-opacity duration-150 focus-visible:opacity-100 disabled:cursor-default ${
            done
              ? "bg-accent-2/25 opacity-100"
              : "bg-black/70 opacity-0 hover:bg-black/85 group-hover:opacity-100"
          }`}
        >
          {done ? (
            <Check className="h-4 w-4 text-accent-2" strokeWidth={2.6} />
          ) : state === "adding" ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2.6} />
          )}
        </button>

        {(state === "error" || dismissError) && (
          <span className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-red-500/90 px-1.5 py-1 text-center text-[9px] font-medium text-white">
            {state === "error" ? "Could not add" : "Could not dismiss"}
          </span>
        )}
      </div>

      <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
        {rec.title}
      </p>
      <p className="text-[10px] text-muted">
        {[rec.mediaType, rec.year].filter(Boolean).join(" · ")}
      </p>

      {trailerOpen && rec.trailerKey && (
        <TrailerModal
          trailerKey={rec.trailerKey}
          title={rec.title}
          onClose={() => setTrailerOpen(false)}
        />
      )}
    </li>
  );
}

/**
 * AI recommendations in "To watch" mode.
 *
 * Deliberately not the same shape as RecommendationsCard, which is a tile in
 * the watched grid that opens the full list: here the list is not something
 * to browse but something to pick from, so it is a strip you scroll through.
 * Each poster carries two independent actions — the center plays the
 * trailer, the badge in the corner adds it to the watchlist — rather than
 * one button doing both, so neither one's hover state can hide the other.
 * "See all" still opens the same modal for the reasons behind each pick.
 *
 * Nothing is fetched: the list is the cached row the server already loaded,
 * so this never costs an API call by itself.
 */
export default function RecommendationsRow({
  titles,
  savedTmdbIds,
  savedTitleKeys,
  onAdded,
  onDismissed,
}: {
  titles: EnrichedRecommendation[];
  /** TMDB ids already in the catalog, watched or waiting. */
  savedTmdbIds: Set<number>;
  /** Normalized titles already in the catalog, for the rows TMDB never matched. */
  savedTitleKeys: Set<string>;
  onAdded: (title: Title) => void;
  onDismissed: (rec: EnrichedRecommendation) => void;
}) {
  const [open, setOpen] = useState(false);

  if (titles.length === 0) return null;

  return (
    <>
      {/* recommendations-row: blurred along with the grid when a context menu
          opens on a card — see globals.css. */}
      <section className="recommendations-row mb-4 rounded-2xl bg-surface p-3 sm:mb-6 sm:p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 flex-none text-amber-400" strokeWidth={1.8} />
          <h2 className="text-[11px] font-semibold uppercase tracking-wide">
            Recommended for you
          </h2>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto flex-none rounded-lg px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-white/5 hover:text-foreground"
          >
            See all
          </button>
        </div>

        <ul className="-mx-3 mt-3 flex snap-x gap-2.5 overflow-x-auto px-3 pb-1 sm:-mx-4 sm:px-4">
          {titles.map((rec) => (
            <Tile
              key={`${rec.mediaType}-${rec.tmdbId ?? rec.title}`}
              rec={rec}
              alreadySaved={
                (rec.tmdbId != null && rec.tmdbId > 0 && savedTmdbIds.has(rec.tmdbId)) ||
                savedTitleKeys.has(normalizeTitle(rec.title))
              }
              onAdded={onAdded}
              onDismissed={onDismissed}
            />
          ))}
        </ul>
      </section>

      {open && (
        <RecommendationsModal
          titles={titles}
          onClose={() => setOpen(false)}
          onAdded={onAdded}
          onDismissed={onDismissed}
          savedTmdbIds={savedTmdbIds}
          savedTitleKeys={savedTitleKeys}
        />
      )}
    </>
  );
}
