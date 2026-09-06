"use client";

import Image from "next/image";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import RecommendationsModal from "@/components/RecommendationsModal";

/** The catalog-grid tile for AI recommendations: a preview of 4, the rest in
 *  the modal opened on click. Nothing is fetched here — the list comes from
 *  the cached row the server already loaded, so this card never costs an
 *  API call by itself. */
export default function RecommendationsCard({ titles }: { titles: EnrichedRecommendation[] }) {
  const [open, setOpen] = useState(false);

  if (titles.length === 0) return null;
  const preview = titles.slice(0, 4);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex aspect-[2/3] flex-col overflow-hidden rounded-2xl bg-surface-2 p-2 text-left transition-colors hover:bg-surface-2/70"
      >
        <div className="flex items-center justify-center gap-1.5 px-1 pb-2 pt-1 text-center">
          <Sparkles className="h-3.5 w-3.5 flex-none text-amber-400" strokeWidth={1.8} />
          <span className="text-[11px] font-semibold leading-tight">Recommended for you</span>
        </div>
        <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-1.5">
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

      {open && <RecommendationsModal titles={titles} onClose={() => setOpen(false)} />}
    </>
  );
}
