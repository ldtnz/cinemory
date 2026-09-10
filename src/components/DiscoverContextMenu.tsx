"use client";

import { Clapperboard, Plus } from "lucide-react";
import ContextMenuShell from "@/components/ContextMenuShell";

/**
 * The right-click / long-press menu for a TMDB result in the "To watch"
 * discovery grid — deliberately just the two things there are to do with an
 * unwatched result, unlike TitleContextMenu's catalog-editing options.
 */
export default function DiscoverContextMenu({
  x,
  y,
  alreadyOnWatchlist,
  onTrailer,
  onAddToWatchlist,
  onClose,
}: {
  x: number;
  y: number;
  alreadyOnWatchlist: boolean;
  onTrailer: () => void;
  onAddToWatchlist: () => void;
  onClose: () => void;
}) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onTrailer();
          onClose();
        }}
        className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm whitespace-nowrap text-foreground hover:bg-white/5"
      >
        <Clapperboard className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.8} />
        Trailer
      </button>
      {!alreadyOnWatchlist && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onAddToWatchlist();
            onClose();
          }}
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm whitespace-nowrap text-foreground hover:bg-white/5"
        >
          <Plus className="h-3.5 w-3.5 flex-none text-accent-2" strokeWidth={2.2} />
          Add to watchlist
        </button>
      )}
    </ContextMenuShell>
  );
}
