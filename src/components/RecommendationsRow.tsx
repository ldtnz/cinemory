"use client";

import Image from "next/image";
import { useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import type { Title } from "@prisma/client";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import type { TmdbCandidate } from "@/lib/tmdb";
import { useAddToWatchlist } from "@/lib/use-add-to-watchlist";
import { normalizeTitle } from "@/lib/title-key";
import RecommendationsModal from "@/components/RecommendationsModal";

/** A recommendation is most of a TMDB candidate already; the rest is only
 *  wanted by the search results list, so null does fine here. */
function toCandidate(rec: EnrichedRecommendation): TmdbCandidate {
  return {
    // Null means TMDB had no match for what Claude suggested. Zero is the
    // "no id" value the API already understands: it falls back to matching
    // on the normalized title alone when checking for duplicates.
    tmdbId: rec.tmdbId ?? 0,
    mediaType: rec.mediaType,
    title: rec.title,
    year: rec.year,
    dataUscita: null,
    totalSeasons: null,
    posterUrl: rec.posterUrl,
    backdropUrl: null,
    overview: null,
    tmdbRating: rec.tmdbRating,
    genres: rec.genres,
  };
}

function Tile({
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
    <li className="w-[104px] flex-none snap-start sm:w-[124px]">
      <button
        type="button"
        onClick={() => add(toCandidate(rec))}
        disabled={done}
        aria-label={
          done ? `${rec.title} is on your watchlist` : `Add ${rec.title} to your watchlist`
        }
        className="group relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 disabled:cursor-default"
      >
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

        {done ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/70">
            <Check className="h-6 w-6 text-accent-2" strokeWidth={2.2} />
          </span>
        ) : (
          <>
            {/* A small permanent badge as well as the hover overlay: touch has
                no hover, and without it nothing says these tiles are
                actionable rather than decorative. */}
            <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-lg bg-black/70 text-white transition-opacity group-hover:opacity-0">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>
            <span
              className={`absolute inset-0 flex items-center justify-center bg-black/60 transition-opacity duration-150 ${
                state === "adding"
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              }`}
            >
              {state === "adding" ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              ) : (
                <Plus className="h-7 w-7 text-white" strokeWidth={2} />
              )}
            </span>
          </>
        )}

        {state === "error" && (
          <span className="absolute inset-x-1 bottom-1 rounded-md bg-red-500/90 px-1.5 py-1 text-center text-[9px] font-medium text-white">
            Could not add
          </span>
        )}
      </button>

      <p className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
        {rec.title}
      </p>
      <p className="text-[10px] text-muted">
        {[rec.mediaType, rec.year].filter(Boolean).join(" · ")}
      </p>
    </li>
  );
}

/**
 * AI recommendations in "To watch" mode.
 *
 * Deliberately not the same shape as RecommendationsCard, which is a tile in
 * the watched grid that opens the full list: here the list is not something
 * to browse but something to pick from, so it is a strip you scroll through
 * and each poster adds itself to the watchlist in one click. The modal is
 * still a click away for the reasons and the trailers.
 *
 * Nothing is fetched: the list is the cached row the server already loaded,
 * so this never costs an API call by itself.
 */
export default function RecommendationsRow({
  titles,
  savedTmdbIds,
  savedTitleKeys,
  onAdded,
}: {
  titles: EnrichedRecommendation[];
  /** TMDB ids already in the catalog, watched or waiting. */
  savedTmdbIds: Set<number>;
  /** Normalized titles already in the catalog, for the rows TMDB never matched. */
  savedTitleKeys: Set<string>;
  onAdded: (title: Title) => void;
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
        <p className="mt-0.5 text-[11px] text-muted">
          Picked from your catalog. Tap one to put it on your watchlist.
        </p>

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
            />
          ))}
        </ul>
      </section>

      {open && <RecommendationsModal titles={titles} onClose={() => setOpen(false)} />}
    </>
  );
}
