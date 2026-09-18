"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";

type Batch = {
  enriched: number;
  unmatched: number;
  cursor: number;
  remaining: number;
  done: boolean;
};

/**
 * Finishes the TMDB fetch for titles that never got one.
 *
 * The import does this straight after adding the titles, in batches driven by
 * the browser — so closing the tab, or losing the connection halfway through,
 * leaves the rest of the catalog with no poster, year, rating or genre and no
 * way back: re-importing the same file adds nothing, so it never starts the
 * fetch again either. This is that fetch on its own, over everything that
 * still has no TMDB match.
 */
export default function FetchMissingDetails({ pending }: { pending: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<{ enriched: number; unmatched: number } | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setDone(null);
    setProgress(0);

    let cursor = 0;
    let enriched = 0;
    let unmatched = 0;
    try {
      for (;;) {
        const res = await fetch("/api/import/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "The fetch stopped early.");
        }
        const batch = (await res.json()) as Batch;
        enriched += batch.enriched;
        unmatched += batch.unmatched;
        cursor = batch.cursor;
        setProgress(enriched + unmatched);
        if (batch.done || batch.remaining === 0) break;
      }
      setDone({ enriched, unmatched });
      // The counts on this page, and the list of posters to fix by hand, are
      // rendered on the server from what was true when it loaded.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The fetch stopped early.");
      if (enriched > 0) setDone({ enriched, unmatched });
    } finally {
      setRunning(false);
    }
  }

  return (
    <SettingsSection
      title="Fetch missing details"
      description={
        <>
          {pending.toLocaleString()} {pending === 1 ? "title has" : "titles have"} no poster, year,
          rating or genre — usually an import that was interrupted before the details came down.
          This fetches them from TMDB, a few at a time. Titles TMDB cannot place are left for
          Missing posters below.
        </>
      }
    >
      <button
        type="button"
        onClick={() => void run()}
        disabled={running}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-xs font-semibold text-foreground transition-colors hover:bg-surface-3 disabled:opacity-50"
      >
        <Sparkles className="h-4 w-4" strokeWidth={1.8} />
        {running
          ? `Fetching… ${progress.toLocaleString()} of ${pending.toLocaleString()}`
          : "Fetch the missing details"}
      </button>

      {done && (
        <p className="mt-3 text-xs text-muted">
          {done.enriched.toLocaleString()} {done.enriched === 1 ? "title" : "titles"} filled in
          {done.unmatched > 0 && `, ${done.unmatched.toLocaleString()} TMDB could not place`}.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </SettingsSection>
  );
}
