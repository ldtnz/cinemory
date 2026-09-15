"use client";

import { Bookmark, Check, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

/**
 * Floating bar for acting on several titles at once, shown while a
 * shift-click selection is standing (see TitleCard).
 *
 * Same glass pill as the Watched / "To watch" switch on mobile, in the same
 * place — the two never appear together, since selecting takes a keyboard.
 */
export default function SelectionBar({
  count,
  onMarkWatched,
  onMoveToWatchlist,
  onDelete,
  onClear,
}: {
  count: number;
  /** Only on the watchlist half, where "watched" is a move that means
   *  something; absent for titles already watched. */
  onMarkWatched?: () => void;
  /** The opposite move, and so the opposite half. */
  onMoveToWatchlist?: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return createPortal(
    <div className="fixed inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex justify-center px-3">
      <div className="tooltip-in flex h-12 items-center gap-1 rounded-2xl border border-white/10 bg-background/95 p-1.5 shadow-[0_10px_30px_-8px_rgba(0,0,0,0.85)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <span className="px-3 text-sm font-medium whitespace-nowrap text-foreground">
          {count} selected
        </span>

        {onMarkWatched && (
          <button
            type="button"
            onClick={onMarkWatched}
            className="flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium leading-none text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Check className="h-4 w-4 flex-none text-accent-2" strokeWidth={2.2} />
            Mark as watched
          </button>
        )}

        {onMoveToWatchlist && (
          <button
            type="button"
            onClick={onMoveToWatchlist}
            className="flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium leading-none text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Bookmark className="h-4 w-4 flex-none" strokeWidth={1.8} />
            Move to To watch
          </button>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium leading-none text-red-400 transition-colors hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4 flex-none" strokeWidth={1.8} />
          Delete
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
          className="flex h-9 w-9 flex-none items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
