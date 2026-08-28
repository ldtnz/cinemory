"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X } from "lucide-react";
import type { Title } from "@prisma/client";
import type { TmdbCandidate } from "@/lib/tmdb";

/** "2022-03-01" -> "1 March 2022". Empty string when TMDB has no date. */
function formatReleaseDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

const PLATFORMS: { value: string; label: string }[] = [
  { value: "Netflix", label: "Netflix" },
  { value: "Amazon Prime Video", label: "Prime Video" },
  { value: "Disney+", label: "Disney+" },
  { value: "Cinema", label: "Cinema" },
];

export default function AddTitleCard({
  initialQuery,
  onAdded,
}: {
  initialQuery: string;
  onAdded: (title: Title) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<TmdbCandidate[]>([]);
  // The query the current results belong to. Compared against what is typed,
  // it tells whether a search is still in flight, debounce included. With a
  // plain "loading" flag, the 350ms wait would instead show a "No results"
  // that is not true yet.
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenCandidate, setChosenCandidate] = useState<TmdbCandidate | null>(null);
  const [platform, setPlatform] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock scrolling of the page underneath while the modal is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  // Automatic search: it fires on open with the catalog query and on every
  // edit of the field, with no button to press. The debounce avoids one TMDB
  // request per keystroke, and each round cancels the previous one so a slow
  // response cannot overwrite a newer one.
  useEffect(() => {
    if (!open || chosenCandidate) return;

    const q = query.trim();
    let cancelled = false;
    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      if (!q) {
        setResults([]);
        setError(null);
        setSearchedQuery("");
        return;
      }
      try {
        const res = await fetch(`/api/tmdb-search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { results: TmdbCandidate[] };
        if (cancelled) return;
        setResults(data.results);
        setError(null);
      } catch {
        if (!cancelled) setError("Search failed.");
      } finally {
        // On error too: without this it would say "Searching..." forever.
        if (!cancelled) setSearchedQuery(q);
      }
    }, q ? 350 : 0);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [open, chosenCandidate, query]);

  function openModal() {
    setQuery(initialQuery);
    setSearchedQuery(null);
    setChosenCandidate(null);
    setPlatform("");
    setError(null);
    setOpen(true);
    setResults([]);
  }

  function close() {
    setOpen(false);
  }

  async function confirm() {
    if (!chosenCandidate || !platform) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate: chosenCandidate, platform }),
      });
      if (res.status === 409) {
        // Already in the catalog: the server message names the title and the
        // platform, so it reads as information rather than a failure.
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Title already in the catalog.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { title: Title & { lastWatchedAt: string | null; createdAt: string; updatedAt: string } };
      const createdTitle: Title = {
        ...data.title,
        lastWatchedAt: data.title.lastWatchedAt ? new Date(data.title.lastWatchedAt) : null,
        createdAt: new Date(data.title.createdAt),
        updatedAt: new Date(data.title.updatedAt),
      };
      onAdded(createdTitle);
      setOpen(false);
    } catch {
      setError("Could not add the title.");
    } finally {
      setSaving(false);
    }
  }

  const trimmedQuery = query.trim();
  const searching = trimmedQuery !== "" && searchedQuery !== trimmedQuery;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="group flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-surface-2/50 text-muted transition-colors hover:border-white/30 hover:bg-surface-2 hover:text-foreground"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted transition-colors group-hover:text-foreground">
          <Plus className="h-5 w-5" strokeWidth={1.8} />
        </div>
        <span className="px-2 text-center text-[11px] font-medium leading-tight">
          Add title
        </span>
      </button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between border-b border-white/5 p-4">
              <h2 className="text-sm font-semibold">Add title</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!chosenCandidate ? (
                <div className="space-y-3">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    placeholder="Title to search on TMDB"
                    className="h-10 w-full rounded-xl bg-surface-2 px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-white/20 sm:text-sm"
                  />

                  {error && <p className="text-xs text-red-400">{error}</p>}

                  {searching && <p className="text-xs text-muted">Cerco su TMDB...</p>}

                  {!searching && results.length === 0 && (
                    <p className="text-xs text-muted">
                      {trimmedQuery
                        ? "No results. Try another title."
                        : "Type a title to search TMDB."}
                    </p>
                  )}

                  {results.length > 0 && (
                    <ul className="space-y-2">
                      {results.map((c) => {
                        const data = formatReleaseDate(c.dataUscita);
                        return (
                          <li key={`${c.mediaType}-${c.tmdbId}`}>
                            <button
                              type="button"
                              onClick={() => setChosenCandidate(c)}
                              className="flex w-full gap-3 rounded-2xl bg-surface-2 p-2.5 text-left outline-none ring-white/40 transition-colors hover:bg-surface-2/70 hover:ring-2"
                            >
                              <div className="relative h-[81px] w-[54px] flex-none overflow-hidden rounded-lg bg-surface">
                                {c.posterUrl ? (
                                  <Image
                                    src={c.posterUrl}
                                    alt=""
                                    fill
                                    sizes="54px"
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted">
                                    no poster
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-1 py-0.5">
                                <p className="line-clamp-1 text-sm font-medium text-foreground">
                                  {c.title}
                                </p>

                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                                  <span>{c.mediaType}</span>
                                  {data && (
                                    <>
                                      <span aria-hidden>·</span>
                                      <span>{data}</span>
                                    </>
                                  )}
                                  {c.tmdbRating ? (
                                    <>
                                      <span aria-hidden>·</span>
                                      <span className="text-amber-400">
                                        ★ {c.tmdbRating.toFixed(1)}
                                      </span>
                                    </>
                                  ) : null}
                                </div>

                                {c.genres && (
                                  <p className="line-clamp-1 text-[11px] text-muted/80">
                                    {c.genres}
                                  </p>
                                )}
                                {c.overview && (
                                  <p className="line-clamp-2 text-[11px] leading-snug text-muted/80">
                                    {c.overview}
                                  </p>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setChosenCandidate(null)}
                    className="text-xs font-medium text-muted hover:text-foreground"
                  >
                    ← Cambia title
                  </button>

                  <div className="flex gap-3">
                    <div className="relative h-28 w-20 flex-none overflow-hidden rounded-lg bg-surface-2">
                      {chosenCandidate.posterUrl ? (
                        <Image
                          src={chosenCandidate.posterUrl}
                          alt={chosenCandidate.title}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{chosenCandidate.title}</p>
                      <p className="text-xs text-muted">
                        {[chosenCandidate.mediaType, chosenCandidate.year].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                      Where did you watch it?
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {PLATFORMS.map((opt) => {
                        const active = platform === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPlatform(opt.value)}
                            className={`rounded-lg px-3 py-2 text-xs font-medium leading-none transition-colors ${
                              active
                                ? "bg-foreground text-background"
                                : "bg-surface-2 text-muted hover:text-foreground"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {error && <p className="text-xs text-red-400">{error}</p>}

                  <button
                    type="button"
                    onClick={confirm}
                    disabled={!platform || saving}
                    className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? "Aggiunta in corso..." : "Add to catalog"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
