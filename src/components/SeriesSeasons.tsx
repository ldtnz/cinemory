"use client";

import { useState } from "react";
import { Layers, Merge } from "lucide-react";

type Response = {
  completed: number;
  cursor: number;
  remaining: number;
  done: boolean;
};

/**
 * Fills in the season count for series already in the catalog.
 *
 * Series imported before this feature have a tmdbId but no season count: the
 * TMDB search does not return it, so each one needs a call to the details
 * endpoint. It runs in batches like the import enrichment, so no single
 * request runs past the serverless duration limit.
 */
export default function SeriesSeasons({
  missing,
  toMerge,
}: {
  missing: number;
  toMerge: { series: number; extraRows: number; examples: { name: string; rows: number }[] };
}) {
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  async function fill() {
    setRunning(true);
    setError(null);
    setDone(false);
    setCompleted(0);

    let cursor = 0;
    let total = 0;
    try {
      for (;;) {
        const res = await fetch("/api/seasons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        if (!res.ok) throw new Error("Lookup failed.");
        const state = (await res.json()) as Response;
        total += state.completed;
        setCompleted(total);
        cursor = state.cursor;
        if (state.done || state.remaining === 0) break;
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setRunning(false);
    }
  }

  async function merge() {
    if (
      !window.confirm(
        `Merge ${toMerge.series} series into one row each? ${toMerge.extraRows} rows will be deleted.`,
      )
    ) {
      return;
    }
    setMerging(true);
    setMergeResult(null);
    try {
      const res = await fetch("/api/seasons/merge", { method: "POST" });
      if (!res.ok) throw new Error("Merge failed.");
      const d = (await res.json()) as { merged: number; removed: number };
      setMergeResult(
        `${d.merged} series merged, ${d.removed} rows deleted. Reload the catalog.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Merge failed.");
    } finally {
      setMerging(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl bg-surface p-4">
      <h2 className="text-sm font-semibold">Series seasons</h2>
      <p className="mt-1 text-xs text-muted">
        {missing === 0
          ? "Every series matched on TMDB knows how many seasons it has."
          : `${missing.toLocaleString()} series do not know their season count yet. The number comes from TMDB and is what shows "watched X of Y" on the posters.`}
      </p>

      <button
        type="button"
        onClick={fill}
        disabled={running || missing === 0}
        className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl bg-foreground px-4 text-xs font-medium text-background disabled:opacity-50"
      >
        <Layers className="h-3.5 w-3.5" strokeWidth={2} />
        {running ? "Fetching..." : "Fetch from TMDB"}
      </button>

      {running && (
        <p className="mt-3 text-xs text-muted">
          {completed} of {missing} done...
        </p>
      )}
      {done && !running && (
        <p className="mt-3 text-xs text-accent-2">
          {completed.toLocaleString()} series completed. Reload the catalog to
          see them.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      {toMerge.extraRows > 0 && (
        <div className="mt-6 border-t border-white/5 pt-4">
          <h3 className="text-xs font-semibold">Series split by season</h3>
          <p className="mt-1 text-xs text-muted">
            {toMerge.series} series take up several rows in the catalog, one per
            season ({toMerge.examples.map((e) => `${e.name}: ${e.rows}`).join(", ")}
            ). That is the old Prime Video import, which listed every season as its
            own title. Merging leaves one row per series with the number of seasons
            watched, and deletes {toMerge.extraRows} extra rows.
          </p>
          <button
            type="button"
            onClick={merge}
            disabled={merging}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-surface-2 px-4 text-xs font-medium disabled:opacity-50"
          >
            <Merge className="h-3.5 w-3.5" strokeWidth={2} />
            {merging ? "Merging..." : "Merge seasons"}
          </button>
          {mergeResult && <p className="mt-3 text-xs text-accent-2">{mergeResult}</p>}
        </div>
      )}
    </section>
  );
}
