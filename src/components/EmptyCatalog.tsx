"use client";

import ImportHistory from "@/components/ImportHistory";
import { Clapperboard, Plus, Upload } from "lucide-react";

/**
 * Shown in place of the grid when a list has nothing in it and no filter is
 * narrowing it, so the first thing a new catalog offers is what to do next
 * rather than a line of grey text.
 */
export default function EmptyCatalog({
  mode,
  onAddTitle,
}: {
  mode: "watched" | "watchlist";
  onAddTitle: () => void;
}) {
  const watched = mode === "watched";
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-5 rounded-3xl bg-surface px-6 py-12 text-center sm:mt-24">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-foreground/80">
        <Clapperboard aria-hidden className="h-7 w-7" strokeWidth={1.5} />
      </span>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          {watched ? "Your catalog starts here." : "Nothing on your watchlist yet."}
        </h2>
        <p className="text-sm leading-relaxed text-foreground/65">
          {watched
            ? "Add the movies and series you have watched, and Cinemory will start suggesting what to watch next."
            : "Save the titles you want to see, and find them here when you are ready."}
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <button
          type="button"
          onClick={onAddTitle}
          className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
          <Plus aria-hidden className="h-4 w-4" strokeWidth={2} />
          {watched ? "Add your first title" : "Add a title"}
        </button>
        {watched && (
          <ImportHistory
            // The import dialog holds a "leave this page?" prompt while it runs and
            // drops it on the render after it finishes, so reloading in the same
            // tick would still trip it.
            onImported={() => setTimeout(() => window.location.reload(), 150)}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-2/70"
              >
                <Upload aria-hidden className="h-4 w-4" strokeWidth={2} />
                Import your history
              </button>
            )}
          />
        )}
      </div>
    </div>
  );
}
