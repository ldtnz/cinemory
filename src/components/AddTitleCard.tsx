"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";
import type { Title } from "@prisma/client";
import type { TmdbCandidate } from "@/lib/tmdb";
import PlatformPicker from "@/components/PlatformPicker";
import { useTmdbSearch } from "@/lib/use-tmdb-search";
import { toDateInputValue, fromDateInputValue } from "@/lib/date-input";

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

function candidateKey(c: TmdbCandidate): string {
  return `${c.mediaType}-${c.tmdbId}`;
}

type ItemStatus = "adding" | "added" | "duplicate" | "error";

/**
 * The search here is one-off by nature — a franchise like Lord of the Rings
 * or The Hobbit turns up several results for the same query — so picking one
 * result used to mean closing the picker and re-typing the same near-
 * identical title to add the next one. Results are now multi-select: check
 * several, choose one platform for all of them (they were usually watched on
 * the same one), and they go in together.
 */
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
  const [step, setStep] = useState<"search" | "confirm">("search");
  const { results, searching, error } = useTmdbSearch(query, {
    enabled: open && step === "search",
    resetOnEnable: true,
  });
  // Keyed by candidateKey() rather than held as a list, so a title stays
  // selected across a query edit even though `results` swaps out from under
  // it — picking from "the hobbit" and then also from "lord of the rings"
  // in the same session is exactly the case this exists for.
  const [selected, setSelected] = useState<Map<string, TmdbCandidate>>(new Map());
  const [itemStatus, setItemStatus] = useState<Map<string, ItemStatus>>(new Map());
  const [platform, setPlatform] = useState("");
  // Defaults to today — not everything gets added the moment it's watched —
  // but editable, same date-for-the-whole-batch convention as platform.
  const [watchedDate, setWatchedDate] = useState(() => toDateInputValue(new Date()));
  const [saving, setSaving] = useState(false);
  // Read from the auto-close timer below, which fires after this render has
  // moved on — a plain closure over `open`/`step` would see whatever they
  // were when confirmBatch() was called, not whether the user has since hit
  // "Back to results" or closed the picker themselves.
  const openRef = useRef(open);
  const stepRef = useRef(step);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Lock scrolling of the page underneath while the modal is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  function openModal() {
    setQuery(initialQuery);
    setStep("search");
    setSelected(new Map());
    setItemStatus(new Map());
    setPlatform("");
    setWatchedDate(toDateInputValue(new Date()));
    setOpen(true);
  }

  function close() {
    setOpen(false);
  }

  function toggleSelect(c: TmdbCandidate) {
    const key = candidateKey(c);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, c);
      return next;
    });
  }

  function removeSelected(key: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  /**
   * Submits everything selected that isn't already resolved — on the first
   * call that's the whole batch, on a retry after a partial failure it's
   * only the ones that failed, since "added" and "duplicate" are terminal.
   * Each title POSTs independently so one failure or one duplicate never
   * blocks the rest of the batch.
   */
  async function confirmBatch() {
    const toSubmit = [...selected.entries()].filter(([key]) => {
      const status = itemStatus.get(key);
      return status !== "added" && status !== "duplicate";
    });
    if (toSubmit.length === 0 || !platform) return;
    const watchedAt = fromDateInputValue(watchedDate);

    setSaving(true);
    setItemStatus((prev) => {
      const next = new Map(prev);
      for (const [key] of toSubmit) next.set(key, "adding");
      return next;
    });

    const outcomes = await Promise.all(
      toSubmit.map(async ([key, candidate]): Promise<[string, ItemStatus]> => {
        try {
          const res = await fetch("/api/titles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              candidate,
              platform,
              lastWatchedAt: watchedAt ? watchedAt.toISOString() : undefined,
            }),
          });
          // Already in the catalog: not a failure, the outcome wanted is
          // already true, so it is marked resolved rather than retried.
          if (res.status === 409) return [key, "duplicate"];
          if (!res.ok) throw new Error();
          const data = (await res.json()) as {
            title: Title & { lastWatchedAt: string | null; createdAt: string; updatedAt: string };
          };
          onAdded({
            ...data.title,
            lastWatchedAt: data.title.lastWatchedAt ? new Date(data.title.lastWatchedAt) : null,
            createdAt: new Date(data.title.createdAt),
            updatedAt: new Date(data.title.updatedAt),
          });
          return [key, "added"];
        } catch {
          return [key, "error"];
        }
      }),
    );

    setItemStatus((prev) => {
      const next = new Map(prev);
      for (const [key, status] of outcomes) next.set(key, status);
      return next;
    });
    setSaving(false);

    if (!outcomes.some(([, status]) => status === "error")) {
      // Nothing left needing a retry: give the checkmarks a beat to register
      // before the picker disappears out from under them — but only close if
      // the user is still where this batch left them, not if they have since
      // gone back to search for more or closed it themselves.
      window.setTimeout(() => {
        if (openRef.current && stepRef.current === "confirm") setOpen(false);
      }, 700);
    }
  }

  const trimmedQuery = query.trim();
  const selectedList = [...selected.entries()];
  const failedCount = selectedList.filter(([key]) => itemStatus.get(key) === "error").length;
  const isRetry = selectedList.some(([key]) => itemStatus.has(key));

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
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add title"
            className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] transition-[max-width] duration-200 ${
              step === "confirm" ? "max-w-lg" : "max-w-3xl"
            }`}
          >
            {/* The search field and "Continue" live in this fixed header
                rather than at the top of the scrollable list below, so both
                stay in view — and reachable — no matter how far down the
                results the user has scrolled. */}
            <div className="flex items-center gap-2 border-b border-white/5 p-4">
              {step === "search" ? (
                <>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoFocus
                    placeholder="Title to search on TMDB"
                    className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-white/20 sm:text-sm"
                  />
                  {selected.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setStep("confirm")}
                      className="flex h-10 flex-none items-center justify-center whitespace-nowrap rounded-xl bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 sm:px-4"
                    >
                      Continue ({selected.size})
                    </button>
                  )}
                </>
              ) : (
                <h2 className="flex-1 text-sm font-semibold">Add title</h2>
              )}
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {step === "search" ? (
                <div className="space-y-3">
                  {error && <p className="text-xs text-red-400">{error}</p>}

                  {searching && <p className="text-xs text-muted">Searching TMDB...</p>}

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
                        const key = candidateKey(c);
                        const isSelected = selected.has(key);
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => toggleSelect(c)}
                              aria-pressed={isSelected}
                              className={`flex w-full gap-3 rounded-2xl p-2.5 text-left outline-none ring-white/40 transition-colors hover:bg-surface-2/70 hover:ring-2 ${
                                isSelected ? "bg-surface-2 ring-2 ring-accent-2/60" : "bg-surface-2"
                              }`}
                            >
                              <div className="relative h-[81px] w-[54px] flex-none overflow-hidden rounded-lg bg-surface">
                                {c.posterUrl ? (
                                  <Image
                                    src={c.posterUrl}
                                    alt=""
                                    fill
                                    unoptimized
                                    sizes="54px"
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted">
                                    no poster
                                  </div>
                                )}
                                {/* Checkbox affordance: makes it read as
                                    "select", not "open", at a glance. */}
                                <span
                                  className={`absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                                    isSelected
                                      ? "border-accent-2 bg-accent-2 text-background"
                                      : "border-white/40 bg-black/40"
                                  }`}
                                >
                                  {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                </span>
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
                <div className="space-y-5 py-1">
                  <button
                    type="button"
                    onClick={() => setStep("search")}
                    className="text-xs font-medium text-muted hover:text-foreground"
                  >
                    ← Back to results
                  </button>

                  <ul className="space-y-2">
                    {selectedList.map(([key, c]) => {
                      const status = itemStatus.get(key);
                      return (
                        <li
                          key={key}
                          className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5"
                        >
                          <div className="relative h-16 w-11 flex-none overflow-hidden rounded-lg bg-surface">
                            {c.posterUrl && (
                              <Image
                                src={c.posterUrl}
                                alt=""
                                fill
                                unoptimized
                                sizes="44px"
                                className="object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-sm font-medium text-foreground">
                              {c.title}
                            </p>
                            <p className="text-xs text-muted">
                              {[c.mediaType, c.year].filter(Boolean).join(" · ")}
                            </p>
                          </div>

                          {status === "adding" && (
                            <span className="h-4 w-4 flex-none animate-spin rounded-full border-2 border-white/25 border-t-white" />
                          )}
                          {status === "added" && (
                            <Check className="h-4 w-4 flex-none text-accent-2" strokeWidth={2.4} />
                          )}
                          {status === "duplicate" && (
                            <span className="flex-none text-[10px] font-medium text-muted">
                              Already in catalog
                            </span>
                          )}
                          {status === "error" && (
                            <span className="flex-none text-[10px] font-medium text-red-400">
                              Failed
                            </span>
                          )}
                          {(!status || status === "error") && !saving && (
                            <button
                              type="button"
                              onClick={() => removeSelected(key)}
                              aria-label={`Remove ${c.title}`}
                              className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-muted hover:bg-white/5 hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="space-y-2">
                    <label
                      htmlFor="add-title-watched-date"
                      className="text-[11px] font-medium uppercase tracking-wide text-muted/80"
                    >
                      When did you watch {selectedList.length === 1 ? "it" : "them"}?
                    </label>
                    <input
                      id="add-title-watched-date"
                      type="date"
                      value={watchedDate}
                      onChange={(e) => setWatchedDate(e.target.value)}
                      max={toDateInputValue(new Date())}
                      className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm text-foreground outline-none [color-scheme:dark] focus:ring-2 focus:ring-white/20"
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                      Where did you watch {selectedList.length === 1 ? "it" : "them"}?
                    </span>
                    <PlatformPicker value={platform} onChange={setPlatform} />
                    {selectedList.length > 1 && (
                      <p className="text-[11px] text-muted/80">
                        Applies to all {selectedList.length} titles. Add a different-platform
                        batch separately.
                      </p>
                    )}
                  </div>

                  {failedCount > 0 && (
                    <p className="text-xs text-red-400">
                      {failedCount} could not be added. Try again below.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={confirmBatch}
                    disabled={!platform || saving || selectedList.every(([key]) => {
                      const status = itemStatus.get(key);
                      return status === "added" || status === "duplicate";
                    })}
                    className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving
                      ? "Adding..."
                      : isRetry
                        ? `Retry ${failedCount || selectedList.length}`
                        : `Add ${selectedList.length} to catalog`}
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
