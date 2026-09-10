"use client";

import { Check, Clapperboard, Pencil, Trash2 } from "lucide-react";
import ContextMenuShell from "@/components/ContextMenuShell";

/**
 * The custom right-click / long-press menu for a catalog card. Same DOM
 * event on desktop (right-click) and touch (long-press) — see
 * DisableContextMenu, which still blocks the native menu everywhere this
 * component isn't listening.
 */
export default function TitleContextMenu({
  x,
  y,
  editing,
  hasTrailerSource,
  onWatchlist,
  onTrailer,
  onMarkWatched,
  onToggleEdit,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  editing: boolean;
  /** Whether this title is matched to TMDB, so a trailer lookup is worth offering. */
  hasTrailerSource: boolean;
  /** On the watchlist, so it can be moved into the watched half. */
  onWatchlist: boolean;
  onTrailer: () => void;
  onMarkWatched: () => void;
  onToggleEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <ContextMenuShell x={x} y={y} onClose={onClose}>
      {onWatchlist && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onMarkWatched();
            onClose();
          }}
          className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm whitespace-nowrap text-foreground hover:bg-white/5"
        >
          <Check className="h-3.5 w-3.5 flex-none text-accent-2" strokeWidth={2.2} />
          Mark as watched
        </button>
      )}
      {hasTrailerSource && (
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
      )}
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onToggleEdit();
          onClose();
        }}
        className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm whitespace-nowrap text-foreground hover:bg-white/5"
      >
        <Pencil className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.8} />
        {editing ? "Exit edit mode" : "Edit"}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDelete();
          onClose();
        }}
        className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm whitespace-nowrap text-red-400 hover:bg-red-500/10"
      >
        <Trash2 className="h-3.5 w-3.5 flex-none" strokeWidth={1.8} />
        Delete
      </button>
    </ContextMenuShell>
  );
}
