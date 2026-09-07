"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Rendered only from a post-hydration event (a click), never during the
 *  initial render, so document.body is always available here — no separate
 *  mount gate needed. Used both from the catalog's context menu (trailerKey
 *  fetched on demand, so starts null while loading) and from the AI
 *  recommendations list (trailerKey already known, loading omitted). */
export default function TrailerModal({
  trailerKey,
  loading = false,
  title,
  onClose,
}: {
  trailerKey: string | null;
  loading?: boolean;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium text-white">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-black">
          {loading ? (
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          ) : trailerKey ? (
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
              title={`${title} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          ) : (
            <p className="px-6 text-center text-sm text-white/60">No trailer available for this title.</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
