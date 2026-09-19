"use client";

import type { TitleIdentityIndex } from "@/lib/title-identity";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useRevealOnView } from "@/lib/reveal-on-view";
import type { Title } from "@prisma/client";
import { recommendationKey } from "@/lib/recommendation-candidate";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import RecommendationsModal from "@/components/RecommendationsModal";

const PREVIEW_SIZE = 4;
const ROTATE_MS = 10000;
const FADE_MS = 300;

/**
 * How the preview arranges itself for the number of posters it actually has.
 *
 * Four splits the tile into quarters, and a quarter of a 2:3 box is itself
 * 2:3 — which is why four looks right and why anything less, left in the same
 * grid, looked like three quarters of the tile had failed to load. Fewer
 * posters take the whole space instead: one fills the tile outright at its own
 * ratio, two stack, three put one across the top with a pair beneath.
 *
 * It matters twice over: near the end of a list, and on the last turn of the
 * rotation whenever the total is not a multiple of four.
 */
const PREVIEW_LAYOUTS: Record<number, { grid: string; first?: string }> = {
  1: { grid: "grid-cols-1 grid-rows-1" },
  2: { grid: "grid-cols-1 grid-rows-2" },
  3: { grid: "grid-cols-2 grid-rows-2", first: "col-span-2" },
  4: { grid: "grid-cols-2 grid-rows-2" },
};

/** The catalog-grid tile for AI recommendations: a preview of 4 (rotating
 *  through the rest of the list if there are more), the full list in the
 *  modal opened on click. Nothing is fetched here — the list comes from the
 *  cached row the server already loaded, so this card never costs an API
 *  call by itself. */
export default function RecommendationsCard({
  titles,
  savedTitles,
  onAdded,
  onDismissed,
}: {
  titles: EnrichedRecommendation[];
  /** TMDB ids already in the catalog, watched or waiting — passed through to
   *  the modal so its "add to watchlist" button can mark what is already
   *  saved, on the Watched page just as it does on To watch. */
  savedTitles: TitleIdentityIndex;
  onAdded: (title: Title) => void;
  onDismissed: (rec: EnrichedRecommendation) => void;
}) {
  const revealRef = useRevealOnView();
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
  const layout = PREVIEW_LAYOUTS[preview.length] ?? PREVIEW_LAYOUTS[PREVIEW_SIZE];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Carrying title-card means the grid's rules apply here too: it dims
        // and blurs with the other cards when a context menu opens elsewhere
        // (it has no menu of its own), and it stays hidden until revealed —
        // so it has to be observed like they are, or it never appears.
        ref={revealRef}
        className="title-card reveal-item flex aspect-[2/3] flex-col overflow-hidden rounded-2xl bg-surface-2 p-2 text-left transition-colors hover:bg-surface-2/70"
      >
        {/* Short enough to stay on one line: this tile is a third of the
            screen wide on a phone, where "Recommended for you" wrapped. The
            modal it opens carries the full wording. */}
        <div className="flex items-center justify-center gap-1 px-0.5 pb-2 pt-1 text-center">
          <Sparkles className="h-3.5 w-3.5 flex-none text-accent-ai" strokeWidth={1.8} />
          <span className="whitespace-nowrap text-[11px] font-semibold leading-tight">
            AI picks
          </span>
        </div>
        <div
          className={`grid flex-1 gap-1.5 transition-opacity duration-300 ${layout.grid} ${
            visible ? "opacity-100" : "opacity-0"
          }`}
        >
          {preview.map((rec, i) => (
            <div
              key={recommendationKey(rec)}
              className={`relative overflow-hidden rounded-lg bg-surface ${
                i === 0 && layout.first ? layout.first : ""
              }`}
            >
              {rec.posterUrl && (
                <Image
                  src={rec.posterUrl}
                  alt={rec.title}
                  fill
                  unoptimized
                  sizes="160px"
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
          onDismissed={onDismissed}
          savedTitles={savedTitles}
        />
      )}
    </>
  );
}
