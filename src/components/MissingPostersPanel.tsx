"use client";

import Image from "next/image";
import { useState } from "react";
import type { TmdbCandidate } from "@/lib/tmdb";

type TitoloMancante = {
  id: number;
  title: string;
  mediaType: string;
  platform: string;
  year: number | null;
};

function GestisciItem({
  title,
  onRisolto,
}: {
  title: TitoloMancante;
  onRisolto: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(title.title);
  const [results, setResults] = useState<TmdbCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [associando, setAssociando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tmdb-search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { results: TmdbCandidate[] };
      setResults(data.results);
    } catch {
      setError("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setOpen(true);
    if (results.length === 0) search();
  }

  async function associa(candidate: TmdbCandidate) {
    setAssociando(true);
    setError(null);
    try {
      const res = await fetch("/api/posters/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: title.id, candidate }),
      });
      if (!res.ok) throw new Error();
      onRisolto(title.id);
    } catch {
      setError("Could not link the poster.");
      setAssociando(false);
    }
  }

  async function ignora() {
    setAssociando(true);
    try {
      const res = await fetch("/api/posters/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: title.id }),
      });
      if (!res.ok) throw new Error();
      onRisolto(title.id);
    } catch {
      setError("The operation failed.");
      setAssociando(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title.title}</p>
          <p className="text-xs text-muted">
            {[title.mediaType, title.year, title.platform].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={ignora}
            disabled={associando}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50"
          >
            Ignora
          </button>
          <button
            type="button"
            onClick={() => (open ? setOpen(false) : openModal())}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium hover:bg-surface-2/70"
          >
            {open ? "Close" : "Search"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="h-9 flex-1 rounded-xl bg-surface-2 px-3 text-base outline-none focus:ring-2 focus:ring-accent-2 sm:text-sm"
              placeholder="Title to search on TMDB"
            />
            <button
              type="button"
              onClick={search}
              disabled={loading}
              className="h-9 flex-none rounded-xl bg-surface-2 px-3 text-xs font-medium hover:bg-surface-2/70 disabled:opacity-50"
            >
              {loading ? "..." : "Search"}
            </button>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {results.length === 0 && !loading ? (
            <p className="text-xs text-muted">Nessun result.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {results.map((c) => (
                <button
                  key={`${c.mediaType}-${c.tmdbId}`}
                  type="button"
                  onClick={() => associa(c)}
                  disabled={associando}
                  className="group relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 text-left outline-none ring-accent-2 hover:ring-2 disabled:opacity-50"
                  title={`${c.title}${c.year ? ` (${c.year})` : ""}`}
                >
                  {c.posterUrl ? (
                    <Image src={c.posterUrl} alt={c.title} fill unoptimized sizes="120px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted">
                      {c.title}
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 text-center text-[9px] leading-tight text-white opacity-0 group-hover:opacity-100">
                    {c.mediaType === "Series" ? "Series" : "Movie"} {c.year ?? ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MissingPostersPanel({
  initialTitles,
}: {
  initialTitles: TitoloMancante[];
}) {
  const [titles, setTitoli] = useState(initialTitles);

  function rimuovi(id: number) {
    setTitoli((prev) => prev.filter((t) => t.id !== id));
  }

  if (titles.length === 0) {
    return <p className="text-sm text-muted">All done, nothing to fix.</p>;
  }

  return (
    <div className="space-y-3">
      {titles.map((t) => (
        <GestisciItem key={t.id} title={t} onRisolto={rimuovi} />
      ))}
    </div>
  );
}
