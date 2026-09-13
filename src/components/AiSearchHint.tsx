"use client";

import { Loader2, Sparkles } from "lucide-react";

/** Small speech-bubble that appears right under the search field in Watched
 *  mode once the plain text search comes up empty — offers to hand the
 *  query to Claude (see /api/search/ai) instead of leaving a dead end. */
export default function AiSearchHint({
  status,
  tried,
  onSearch,
}: {
  status: "idle" | "loading" | "error";
  /** An AI search already ran for the current query and still found
   *  nothing — distinct from "not tried yet", which still shows the button. */
  tried: boolean;
  onSearch: () => void;
}) {
  return (
    <div className="relative mx-auto -mt-2 mb-6 w-fit max-w-xs">
      <div
        aria-hidden
        className="absolute -top-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-white/10 bg-surface"
      />
      <div className="relative flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-3 py-2 text-xs shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]">
        {status === "loading" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 flex-none animate-spin text-muted" strokeWidth={2} />
            <span className="text-muted">Searching with AI...</span>
          </>
        ) : status === "error" ? (
          <>
            <span className="text-muted">AI search failed.</span>
            <button
              type="button"
              onClick={onSearch}
              className="font-medium text-foreground hover:underline"
            >
              Retry
            </button>
          </>
        ) : tried ? (
          <span className="text-muted">No matches, even with AI search.</span>
        ) : (
          <button type="button" onClick={onSearch} className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 flex-none text-accent-2" strokeWidth={1.8} />
            <span className="font-medium text-foreground">No matches — try search with AI</span>
          </button>
        )}
      </div>
    </div>
  );
}
