"use client";

import { Loader2, Sparkles } from "lucide-react";

export type AiSearchHintState = {
  status: "idle" | "loading" | "error";
  /** An AI search already ran for the current query and still found nothing —
   *  distinct from "not tried yet", which is what shows the button. */
  tried: boolean;
};

/** Tooltip hanging under the search field: offers to hand the query to
 *  Claude (see /api/search/ai).
 *
 *  Positioning is the caller's job — `className` and `style` are where the
 *  anchoring goes, since the search field is in two different places on
 *  desktop and mobile. The bubble always centres itself in the box they
 *  describe, so a caller whose box is wider than the field (the mobile row,
 *  which also carries four buttons) pads that box down to the field. */
export default function AiSearchHint({
  status,
  tried,
  onSearch,
  className = "",
  style,
}: AiSearchHintState & {
  onSearch: () => void;
  className?: string;
  /** Padding that narrows the anchoring box down to the field it belongs to. */
  style?: React.CSSProperties;
}) {
  const bubble =
    "tooltip-in relative flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]";
  // Only the offer is clickable; the other three states are just messages, so
  // they must not light up under the pointer.
  const interactive = status === "idle" && !tried;

  return (
    <div className={`pointer-events-none flex justify-center ${className}`} style={style}>
      <div className={`pointer-events-auto relative ${interactive ? "group" : ""}`}>
        {/* Drawn rather than built out of a rotated bordered square: a real
            triangle in the bubble's own colour leaves no seam where it meets
            the bubble. It hovers with the bubble rather than on its own, or
            the two come apart into different shades under the pointer. */}
        <svg
          viewBox="0 0 12 6"
          fill="currentColor"
          aria-hidden
          className="tooltip-in absolute -top-[5px] left-1/2 h-[6px] w-3 -translate-x-1/2 text-surface-2 transition-colors group-hover:text-surface-3"
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
            className={`${bubble} font-medium text-foreground transition-colors group-hover:bg-surface-3`}
          >
            <Sparkles className="h-3.5 w-3.5 flex-none text-accent-ai" strokeWidth={1.8} />
            Search with AI
          </button>
        )}
      </div>
    </div>
  );
}
