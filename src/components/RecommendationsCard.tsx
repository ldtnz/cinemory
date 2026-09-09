"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Title } from "@prisma/client";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import RecommendationsModal from "@/components/RecommendationsModal";

const PREVIEW_SIZE = 4;
const ROTATE_MS = 10000;
const FADE_MS = 300;

/** The catalog-grid tile for AI recommendations: a preview of 4 (rotating
 *  through the rest of the list if there are more), the full list in the
 *  modal opened on click. Nothing is fetched here — the list comes from the
 *  cached row the server already loaded, so this card never costs an API
 *  call by itself. */
export default function RecommendationsCard({
  titles,
  savedTmdbIds,
  savedTitleKeys,
  onAdded,
}: {
  titles: EnrichedRecommendation[];
  /** TMDB ids already in the catalog, watched or waiting — passed through to
   *  the modal so its "add to watchlist" button can mark what is already
   *  saved, on the Watched page just as it does on To watch. */
  savedTmdbIds: Set<number>;
  savedTitleKeys: Set<string>;
  onAdded: (title: Title) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const chunks = useMemo(() => {
    const groups: EnrichedRecommendation[][] = [];
    for (let i = 0; i < titles.length; i += PREVIEW_SIZE) {
      groups.push(titles.slice(i, i + PREVIEW_SIZE));
    }
    return groups;
  }, [titles]);

  // Cycles the preview through the rest of the list, fading out the old
  // chunk before swapping in the next one so the change never pops.
  useEffect(() => {
    if (chunks.length <= 1) return;
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setChunkIndex((i) => (i + 1) % chunks.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATE_MS);
    return () => clearInterval(interval);
  }, [chunks.length]);

  if (titles.length === 0) return null;
  const preview = chunks[chunkIndex] ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // title-card: so it dims and blurs along with every other card when
        // a right-click/long-press context menu opens elsewhere in the grid
        // (see globals.css) — it has no context menu of its own.
        className="title-card flex aspect-[2/3] flex-col overflow-hidden rounded-2xl bg-surface-2 p-2 text-left transition-colors hover:bg-surface-2/70"
      >
        <div className="flex items-center justify-center gap-1.5 px-1 pb-2 pt-1 text-center">
          <Sparkles className="h-3.5 w-3.5 flex-none text-amber-400" strokeWidth={1.8} />
          <span className="text-[11px] font-semibold leading-tight">Recommended for you</span>
        </div>
        <div
          className={`grid flex-1 grid-cols-2 grid-rows-2 gap-1.5 transition-opacity duration-300 ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          {preview.map((rec) => (
            <div key={rec.tmdbId} className="relative overflow-hidden rounded-lg bg-surface">
              {rec.posterUrl && (
                <Image
                  src={rec.posterUrl}
                  alt={rec.title}
                  fill
                  unoptimized
                  sizes="80px"
                  className="object-cover"
                />
              )}
            </div>
          ))}
        </div>
      </button>

      {open && (
        <RecommendationsModal
          titles={titles}
          onClose={() => setOpen(false)}
          onAdded={onAdded}
          savedTmdbIds={savedTmdbIds}
          savedTitleKeys={savedTitleKeys}
        />
      )}
    </>
  );
}
