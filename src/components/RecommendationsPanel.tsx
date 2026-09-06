"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { EnrichedRecommendation } from "@/lib/recommendations";

/** Hours left, rounded up, until the next refresh is allowed. */
function hoursUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (60 * 60 * 1000)));
}

export default function RecommendationsPanel({
  initialTitles,
  initialGeneratedAt,
  initialCanRefresh,
  initialNextRefreshAt,
}: {
  initialTitles: EnrichedRecommendation[];
  initialGeneratedAt: string | null;
  initialCanRefresh: boolean;
  initialNextRefreshAt: string | null;
}) {
  const [titles, setTitles] = useState(initialTitles);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [canRefresh, setCanRefresh] = useState(initialCanRefresh);
  const [nextRefreshAt, setNextRefreshAt] = useState(initialNextRefreshAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recommendations", { method: "POST" });
      const data = (await res.json()) as {
        titles?: EnrichedRecommendation[];
        generatedAt?: string | null;
        canRefresh?: boolean;
        nextRefreshAt?: string | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not generate recommendations.");
        return;
      }
      setTitles(data.titles ?? []);
      setGeneratedAt(data.generatedAt ?? null);
      setCanRefresh(data.canRefresh ?? false);
      setNextRefreshAt(data.nextRefreshAt ?? null);
    } catch {
      setError("Could not generate recommendations.");
    } finally {
      setLoading(false);
    }
  }

  const wait = !canRefresh && nextRefreshAt ? hoursUntil(nextRefreshAt) : 0;

  return (
    <section className="mb-8 rounded-2xl bg-surface p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-amber-400" strokeWidth={1.8} />
        AI recommendations
      </h2>
      <p className="mt-1 mb-4 text-xs text-muted">
        {generatedAt
          ? `Last generated ${new Date(generatedAt).toLocaleString()}. `
          : "Not generated yet. "}
        Claude suggests what to watch next based on your catalog. Refreshes at
        most once every 24 hours to keep API costs minimal.
      </p>

      {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={generate}
        disabled={loading || !canRefresh}
        className="rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading
          ? "Generating..."
          : titles.length === 0
            ? "Generate recommendations"
            : "Refresh recommendations"}
      </button>

      {wait > 0 && !loading && (
        <p className="mt-2 text-[11px] text-muted">
          Next refresh available in {wait === 1 ? "1 hour" : `${wait} hours`}.
        </p>
      )}
    </section>
  );
}
