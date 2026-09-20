"use client";

import { BrainCircuit, Loader2, Sparkles } from "lucide-react";

export type SemanticSearchHintState = {
  status: "idle" | "loading" | "error";
  source: "local" | "ai";
  semanticTried: boolean;
  aiTried: boolean;
  canTryAi: boolean;
};

/** Local metadata search first; Claude remains an optional second pass. */
export default function SemanticSearchHint({
  status,
  source,
  semanticTried,
  aiTried,
  canTryAi,
  onSemanticSearch,
  onAiSearch,
  className = "",
  style,
}: SemanticSearchHintState & {
  onSemanticSearch: () => void;
  onAiSearch?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const bubble =
    "tooltip-in relative flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)]";
  const retry = source === "ai" && onAiSearch ? onAiSearch : onSemanticSearch;
  const interactive = status === "idle" && (!semanticTried || (canTryAi && !aiTried));

  return (
    <div className={`pointer-events-none flex justify-center ${className}`} style={style}>
      <div className={`pointer-events-auto relative ${interactive ? "group" : ""}`}>
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
            {source === "ai" ? "Searching with AI..." : "Searching descriptions and genres..."}
          </div>
        ) : status === "error" ? (
          <div className={bubble}>
            <span className="text-muted">{source === "ai" ? "AI search failed." : "Local search failed."}</span>
            <button type="button" onClick={retry} className="font-medium text-foreground hover:underline">
              Retry
            </button>
          </div>
        ) : !semanticTried ? (
          <button
            type="button"
            onClick={onSemanticSearch}
            className={`${bubble} font-medium text-foreground transition-colors group-hover:bg-surface-3`}
          >
            <BrainCircuit className="h-3.5 w-3.5 flex-none text-accent-2" strokeWidth={1.8} />
            Search by meaning
          </button>
        ) : canTryAi && !aiTried && onAiSearch ? (
          <button
            type="button"
            onClick={onAiSearch}
            className={`${bubble} font-medium text-foreground transition-colors group-hover:bg-surface-3`}
          >
            <Sparkles className="h-3.5 w-3.5 flex-none text-accent-ai" strokeWidth={1.8} />
            No local matches · Try AI
          </button>
        ) : (
          <div className={`${bubble} text-muted`}>
            {aiTried ? "No matches, even with AI." : "No semantic matches in your metadata."}
          </div>
        )}
      </div>
    </div>
  );
}
