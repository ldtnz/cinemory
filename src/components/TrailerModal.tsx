"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { setLandscapeAllowed } from "@/lib/landscape";

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

  // The one screen worth turning the phone sideways for: while it is open the
  // portrait lock and its "rotate your device" overlay stand down, and the
  // video below takes the extra width.
  useEffect(() => {
    setLandscapeAllowed(true);
    return () => setLandscapeAllowed(false);
  }, []);

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-[60] flex items-center justify-center bg-background/90 p-4 [@media(max-height:500px)]:p-2"
      onClick={onClose}
    >
      {/* Width is capped by whichever runs out first, the screen or the room
          a 16:9 box needs in the height left over — so turning the phone
          sideways widens the video instead of cropping it. The short-screen
          figure reserves less because the title row above is dropped there. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title} trailer`}
        className="dialog-in w-full max-w-[min(42rem,calc((100dvh-6rem)*16/9))] [@media(max-height:500px)]:max-w-[calc((100dvh-1rem)*16/9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3 [@media(max-height:500px)]:hidden">
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
        <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl bg-black [@media(max-height:500px)]:rounded-xl">
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
          {/* Sideways the video takes the whole screen, so the way out has to
              sit on top of it rather than in a row that is no longer there. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="absolute right-2 top-2 hidden h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur hover:text-white [@media(max-height:500px)]:flex"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
