"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";
import type { Title } from "@prisma/client";
import type { TmdbCandidate } from "@/lib/tmdb";
import PlatformPicker from "@/components/PlatformPicker";
import { useTmdbSearch } from "@/lib/use-tmdb-search";
import { useHorizontalWheel } from "@/lib/use-horizontal-wheel";
import { normalizeTitle } from "@/lib/title-key";
import { toDateInputValue, fromDateInputValue } from "@/lib/date-input";

/** "2022-03-01" -> "1 March 2022". Empty string when TMDB has no date. */
function formatReleaseDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function candidateKey(c: TmdbCandidate): string {
  return `${c.mediaType}-${c.tmdbId}`;
}

type ItemStatus = "adding" | "added" | "duplicate" | "error";
type BrowseSuggestions = {
  popular: TmdbCandidate[];
  newReleases: TmdbCandidate[];
};

export function AddTitleCardTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex aspect-[2/3] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-surface-2/50 text-muted transition-colors hover:border-white/30 hover:bg-surface-2 hover:text-foreground"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted transition-colors group-hover:text-foreground">
        <Plus className="h-5 w-5" strokeWidth={1.8} />
      </div>
      <span className="px-2 text-center text-[11px] font-medium leading-tight">Add title</span>
    </button>
  );
}

/**
 * The search here is one-off by nature — a franchise like Lord of the Rings
 * or The Hobbit turns up several results for the same query — so picking one
 * result used to mean closing the picker and re-typing the same near-
 * identical title to add the next one. Results are multi-select: check
 * several, choose whether they belong in Watched or To watch, and they go in
 * together. Watched batches also share one platform and date.
 */
export default function AddTitleCard({
  open,
  onOpenChange,
  initialQuery,
  initialDestination,
  savedTmdbIds,
  savedTitleKeys,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery: string;
  initialDestination: "watched" | "watchlist";
  /** Both halves of the catalog: adding something already on the watchlist
   *  is refused the same way adding something already watched is, so a
   *  result counts as "already there" either way. */
  savedTmdbIds: Set<number>;
  savedTitleKeys: Set<string>;
  onAdded: (title: Title) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [step, setStep] = useState<"search" | "confirm">("search");
  const [destination, setDestination] = useState<"watched" | "watchlist">(initialDestination);
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
  const [browseSuggestions, setBrowseSuggestions] = useState<BrowseSuggestions | null>(null);
  // A row each, so a wheel over one of them scrolls it rather than the
  // dialog behind it. Declared here because suggestionSection runs twice
  // and a hook cannot.
  const popularRow = useHorizontalWheel<HTMLDivElement>();
  const newReleasesRow = useHorizontalWheel<HTMLDivElement>();
  const [browseError, setBrowseError] = useState(false);
  // Read from the auto-close timer below, which fires after this render has
  // moved on — a plain closure over `open`/`step` would see whatever they
  // were when confirmBatch() was called, not whether the user has since hit
  // "Back to results" or closed the picker themselves.
  const openRef = useRef(open);
  const stepRef = useRef(step);
  const autoCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (autoCloseTimerRef.current !== null) window.clearTimeout(autoCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/tmdb-browse", { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = (await response.json()) as BrowseSuggestions;
        setBrowseSuggestions(data);
        setBrowseError(false);
      } catch {
        if (!controller.signal.aborted) setBrowseError(true);
      }
    })();
    return () => controller.abort();
  }, [open]);

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

  function close() {
    onOpenChange(false);
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
    const watchlist = destination === "watchlist";
    if (toSubmit.length === 0 || (!watchlist && !platform)) return;
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
              watchlist,
              platform: watchlist ? "" : platform,
              lastWatchedAt:
                !watchlist && watchedAt ? watchedAt.toISOString() : undefined,
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
      autoCloseTimerRef.current = window.setTimeout(() => {
        if (openRef.current && stepRef.current === "confirm") onOpenChange(false);
      }, 700);
    }
  }

  // Matched on the TMDB id where there is one and on the normalized title
  // otherwise — the same pair /api/titles checks before refusing a duplicate,
  // so what is marked here is exactly what would come back as one.
  function alreadyInCatalog(c: TmdbCandidate): boolean {
    return (
      (c.tmdbId > 0 && savedTmdbIds.has(c.tmdbId)) || savedTitleKeys.has(normalizeTitle(c.title))
    );
  }

  const trimmedQuery = query.trim();
  const selectedList = [...selected.entries()];
  const failedCount = selectedList.filter(([key]) => itemStatus.get(key) === "error").length;
  const isRetry = selectedList.some(([key]) => itemStatus.has(key));
  const visiblePopular =
    browseSuggestions?.popular.filter((candidate) => !alreadyInCatalog(candidate)).slice(0, 6) ?? [];
  const visibleNewReleases =
    browseSuggestions?.newReleases
      .filter((candidate) => !alreadyInCatalog(candidate))
      .slice(0, 6) ?? [];

  function suggestionSection(
    label: string,
    candidates: TmdbCandidate[],
    scroller: React.RefObject<HTMLDivElement | null>,
  ) {
    return (
      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-foreground">{label}</h3>
        {/* A phone has no room for two grids of six: at three across they
            were two rows each, and stacked the dialog ran past the bottom of
            the screen. One scrolling row each holds it to a single poster's
            height, and the grid comes back as soon as all six fit at once.
            The negative margin lets the row bleed to the dialog's edges, so
            the last poster is visibly cut rather than sitting in a gutter
            looking like the end of the list. */}
        <div
          ref={scroller}
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-6 sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {candidates.map((candidate) => {
            const key = candidateKey(candidate);
            const isSelected = selected.has(key);
            const inCatalog = alreadyInCatalog(candidate);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleSelect(candidate)}
                disabled={inCatalog}
                aria-pressed={isSelected}
                aria-label={
                  inCatalog
                    ? `${candidate.title} is already in your catalog`
                    : `Select ${candidate.title}`
                }
                className={`group relative aspect-[2/3] w-[28vw] flex-none overflow-hidden rounded-xl bg-surface-2 text-left outline-none ring-white/40 transition sm:w-auto ${
                  inCatalog
                    ? "cursor-default opacity-55"
                    : `hover:ring-1 ${isSelected ? "ring-1 ring-accent-2/70" : ""}`
                }`}
              >
                {candidate.posterUrl && (
                  <Image
                    src={candidate.posterUrl}
                    alt=""
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 28vw, 110px"
                    className="object-cover"
                  />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-2 pt-8">
                  <span className="line-clamp-2 block text-[10px] font-medium leading-tight text-white">
                    {candidate.title}
                  </span>
                  <span className="mt-0.5 block text-[9px] text-white/60">
                    {[candidate.mediaType, candidate.year].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span
                  className={`absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border backdrop-blur-sm ${
                    inCatalog || isSelected
                      ? "border-accent-2 bg-accent-2 text-background"
                      : "border-white/50 bg-black/45 text-transparent"
                  }`}
                >
                  {(inCatalog || isSelected) && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  function suggestionSkeleton(label: string) {
    return (
      <section className="space-y-2.5" aria-hidden>
        <div className="h-3 w-24 animate-pulse rounded bg-surface-3" />
        {/* Same shape as the row it stands in for, or the dialog resizes
            under the reader the moment the answer arrives. */}
        <div className="-mx-4 flex gap-2 overflow-hidden px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-6 sm:px-0 sm:pb-0">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={`${label}-${index}`}
              className="aspect-[2/3] w-[28vw] flex-none animate-pulse rounded-xl bg-surface-2 sm:w-auto"
            />
          ))}
        </div>
      </section>
    );
  }

  function searchResultsSkeleton() {
    return (
      <div className="space-y-2" aria-label="Searching titles" aria-busy="true">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex gap-3 rounded-2xl bg-surface-2 p-2.5" aria-hidden>
            <div className="h-[81px] w-[54px] flex-none animate-pulse rounded-lg bg-surface-3" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-surface-3" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-surface-3" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-surface-3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {open && mounted && createPortal(
        <div className="app-modal-overlay overlay-in fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add title"
            className={`app-modal-panel dialog-in flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl transition-[max-width] duration-200 ${
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
                    placeholder="Search for a title"
                    className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-base text-foreground outline-none sm:text-sm"
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
                className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-surface-2 text-muted transition-colors hover:bg-surface-3 hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {step === "search" ? (
                <div className="space-y-3">
                  {!trimmedQuery ? (
                    <div className="space-y-5">
                      {browseSuggestions ? (
                        <>
                          {suggestionSection("Popular now", visiblePopular, popularRow)}
                          {suggestionSection("New releases", visibleNewReleases, newReleasesRow)}
                        </>
                      ) : browseError ? (
                        <p className="py-6 text-center text-xs text-muted">
                          Suggestions could not be loaded. Search for a title instead.
                        </p>
                      ) : (
                        <>
                          {suggestionSkeleton("popular")}
                          {suggestionSkeleton("new")}
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      {error && <p className="text-xs text-red-400">{error}</p>}

                      {searching ? searchResultsSkeleton() : results.length === 0 ? (
                        <p className="text-xs text-muted">No results. Try another title.</p>
                      ) : (
                    <ul className="space-y-2">
                      {results.map((c) => {
                        const data = formatReleaseDate(c.dataUscita);
                        const key = candidateKey(c);
                        const isSelected = selected.has(key);
                        const inCatalog = alreadyInCatalog(c);
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => toggleSelect(c)}
                              aria-pressed={isSelected}
                              // Selecting it could only end in the "already in
                              // catalog" outcome the overlay is announcing.
                              disabled={inCatalog}
                              aria-label={inCatalog ? `${c.title} is already in your catalog` : undefined}
                              className={`flex w-full gap-3 rounded-2xl bg-surface-2 p-2.5 text-left outline-none ring-white/40 transition-colors ${
                                inCatalog
                                  ? "cursor-default"
                                  : `hover:bg-surface-2/70 hover:ring-1 ${
                                      isSelected ? "ring-1 ring-accent-2/60" : ""
                                    }`
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
                                {inCatalog ? (
                                  /* Covers the poster rather than sitting in a
                                     corner: it is the reason the row cannot be
                                     picked, so it should be the first thing
                                     read, not a detail to notice. */
                                  <span className="absolute inset-0 flex items-center justify-center bg-black/70">
                                    <Check className="h-5 w-5 text-accent-2" strokeWidth={2.4} />
                                  </span>
                                ) : (
                                  /* Checkbox affordance: makes it read as
                                     "select", not "open", at a glance. */
                                  <span
                                    className={`absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border ${
                                      isSelected
                                        ? "border-accent-2 bg-accent-2 text-background"
                                        : "border-white/40 bg-black/40"
                                    }`}
                                  >
                                    {isSelected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                                  </span>
                                )}
                              </div>

                              <div className="min-w-0 flex-1 space-y-1 py-0.5">
                                <p
                                  className={`line-clamp-1 text-sm font-medium ${
                                    inCatalog ? "text-muted" : "text-foreground"
                                  }`}
                                >
                                  {c.title}
                                </p>

                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                                  {inCatalog && (
                                    <>
                                      <span className="font-medium text-accent-2">In catalog</span>
                                      <span aria-hidden>·</span>
                                    </>
                                  )}
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
                    </>
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
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted/80">
                      Add to
                    </span>
                    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1.5">
                      <button
                        type="button"
                        onClick={() => setDestination("watched")}
                        disabled={saving}
                        className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          destination === "watched"
                            ? "bg-foreground text-background"
                            : "text-muted hover:bg-surface-3 hover:text-foreground"
                        }`}
                      >
                        Watched
                      </button>
                      <button
                        type="button"
                        onClick={() => setDestination("watchlist")}
                        disabled={saving}
                        className={`rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                          destination === "watchlist"
                            ? "bg-foreground text-background"
                            : "text-muted hover:bg-surface-3 hover:text-foreground"
                        }`}
                      >
                        To watch
                      </button>
                    </div>
                  </div>

                  {destination === "watched" && (
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
                        className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm text-foreground outline-none [color-scheme:dark] focus:ring-1 focus:ring-white/20"
                      />
                    </div>
                  )}

                  {destination === "watched" && (
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
                  )}

                  {failedCount > 0 && (
                    <p className="text-xs text-red-400">
                      {failedCount} could not be added. Try again below.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={confirmBatch}
                    disabled={
                      (destination === "watched" && !platform) ||
                      saving ||
                      selectedList.every(([key]) => {
                        const status = itemStatus.get(key);
                        return status === "added" || status === "duplicate";
                      })
                    }
                    className="w-full rounded-2xl bg-foreground py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {saving
                      ? "Adding..."
                      : isRetry
                        ? `Retry ${failedCount || selectedList.length}`
                        : `Add ${selectedList.length} to ${
                            destination === "watched" ? "watched" : "to watch"
                          }`}
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
