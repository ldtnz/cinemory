"use client";

import { Loader2, Sparkles } from "lucide-react";

export type AiSearchHintState = {
  status: "idle" | "loading" | "error";
  /** An AI search already ran for the current query and still found nothing —
   *  distinct from "not tried yet", which is what shows the button. */
  tried: boolean;
};

/** Tooltip hanging under the search field in Watched mode once the plain
 *  title search comes up empty: offers to hand the query to Claude instead
 *  (see /api/search/ai).
 *
 *  Positioning is the caller's job — `className` is where the anchoring goes
 *  (the search field is in two different places on desktop and mobile), and
 *  the bubble centers itself inside whatever box that describes. */
export default function AiSearchHint({
  status,
  tried,
  onSearch,
  className = "",
}: AiSearchHintState & {
  onSearch: () => void;
  className?: string;
}) {
  const bubble =
    "tooltip-in relative flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]";

  return (
    <div className={`pointer-events-none flex justify-center ${className}`}>
      <div className="pointer-events-auto relative">
        {/* Drawn rather than built out of a rotated bordered square: a real
            triangle in the bubble's own colour leaves no seam where it meets
            the bubble. */}
        <svg
          viewBox="0 0 12 6"
          fill="currentColor"
          aria-hidden
          className="tooltip-in absolute -top-[5px] left-1/2 h-[6px] w-3 -translate-x-1/2 text-surface-2"
        >
          <path d="M6 0 12 6H0z" />
        </svg>

        {status === "loading" ? (
          <div className={`${bubble} text-muted`}>
            <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" strokeWidth={2} />
            Searching with AI...
          </div>
        ) : status === "error" ? (
          <div className={bubble}>
            <span className="text-muted">AI search failed.</span>
            <button
              type="button"
              onClick={onSearch}
              className="font-medium text-foreground hover:underline"
            >
              Retry
            </button>
          </div>
        ) : tried ? (
          <div className={`${bubble} text-muted`}>No matches, even with AI.</div>
        ) : (
          <button
            type="button"
            onClick={onSearch}
            className={`${bubble} font-medium text-foreground transition-colors hover:bg-[#26262a]`}
          >
            <Sparkles className="h-3.5 w-3.5 flex-none text-accent-ai" strokeWidth={1.8} />
            Search with AI
          </button>
        )}
      </div>
    </div>
  );
}
