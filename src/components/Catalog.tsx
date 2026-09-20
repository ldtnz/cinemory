"use client";

import { useCallback, useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CatalogTitle } from "@/lib/catalog-title";
import FilterBar from "@/components/FilterBar";
import TitleCard from "@/components/TitleCard";
import type { SeasonEdit } from "@/components/EditWatchedDialog";
import { cardElement, pixelAppear, pixelDissolve, pixelDissolveAll } from "@/lib/pixel-dissolve";
import AddTitleCard, { AddTitleCardTrigger } from "@/components/AddTitleCard";
import EmptyCatalog from "@/components/EmptyCatalog";
import RecommendationsCard from "@/components/RecommendationsCard";
import RecommendationsRow from "@/components/RecommendationsRow";
import SelectionBar from "@/components/SelectionBar";
import MarkWatchedDialog from "@/components/MarkWatchedDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import { matchesSearchWords, searchWords } from "@/lib/title-key";
import { watchProviderKey } from "@/lib/watch-providers";
import { TitleIdentityIndex } from "@/lib/title-identity";
import { useWatchProviders } from "@/lib/use-watch-providers";
import { send, notifyWriteFailed } from "@/lib/offline";
import { splitGenres } from "@/lib/genres";
import type { WatchMode } from "@/lib/watch-mode";
import { useEditMode } from "@/lib/edit-mode";

/**
 * How many cards are added at a time as the grid is scrolled.
 *
 * The whole result set used to go into the DOM at once, capped at 1500. On a
 * catalog of a couple of thousand that is ~14k nodes and as many posters, and
 * a phone never recovers: the grid took ~9s to settle and a long-press waited
 * ~19s for its menu, because every one of those cards was also a filter layer
 * for the dimming (see globals.css). Three phone screens' worth at a time
 * keeps the DOM small without the reader ever catching the grid growing.
 */
const PAGE_SIZE = 60;

export default function Catalog({
  initialTitles,
  region,
  recommendations = [],
  aiSearchEnabled = false,
}: {
  initialTitles: CatalogTitle[];
  region: string;
  recommendations?: EnrichedRecommendation[];
  /** Same gate as recommendations — ANTHROPIC_API_KEY configured — since the
   *  "search with AI" hint calls Claude too. */
  aiSearchEnabled?: boolean;
}) {
  // The catalog lives in component state (not just as a prop) so new titles
  // can be added without reloading the page.
  const [catalog, setCatalog] = useState(initialTitles);
  // Same reason: a "not interested" needs to remove a title from what's
  // shown right away, in both the strip and the modal at once — both read
  // from this one array.
  const [recs, setRecs] = useState(recommendations);

  // Filters and sorting live in component state only, not in the URL, so the
  // address stays "/" instead of filling up with parameters like
  // "?platform=Netflix&mediaType=Movie".
  const [q, setQ] = useState("");
  // The search field uses "q" and stays instant; the filter and the grid
  // follow "deferredQ", which React updates at a lower priority. Letters
  // therefore appear immediately even while the list is still redrawing.
  const deferredQ = useDeferredValue(q);
  const [mode, setMode] = useState<WatchMode>("watched");
  const [platform, setPlatform] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("recent");

  // Tracks local semantic and optional AI searches for whatever query and
  // mode they ran against. Keyed by those rather than cleared on
  // every keystroke via an effect: typing further, or switching halves, just
  // makes the pair below stop matching, which is enough to treat it as stale
  // without an explicit reset.
  const [semanticSearchAttempt, setSemanticSearchAttempt] = useState<{
    query: string;
    mode: WatchMode;
    status: "loading" | "error" | "done";
    ids: number[];
  } | null>(null);
  const [aiSearchAttempt, setAiSearchAttempt] = useState<{
    query: string;
    mode: WatchMode;
    status: "loading" | "error" | "done";
    /** Watched: the catalog rows Claude picked out. */
    ids: number[];
  } | null>(null);
  const trimmedQuery = deferredQ.trim();
  const semanticSearch =
    semanticSearchAttempt?.query === trimmedQuery && semanticSearchAttempt.mode === mode
      ? semanticSearchAttempt
      : null;
  const aiSearch =
    aiSearchAttempt?.query === trimmedQuery && aiSearchAttempt.mode === mode
      ? aiSearchAttempt
      : null;

  // Titles picked out with shift-click, to act on together (see SelectionBar).
  // Held as ids rather than rows so the set survives the catalog being
  // refreshed under it; what it means is resolved against the visible
  // results below, which is also what narrows it when the filters change.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [bulkAction, setBulkAction] = useState<"watched" | "towatch" | "delete" | null>(null);
  const [addTitle, setAddTitle] = useState<{
    open: boolean;
    initialQuery: string;
    initialDestination: WatchMode | null;
  }>({ open: false, initialQuery: "", initialDestination: null });

  const toggleSelect = useCallback((title: CatalogTitle) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(title.id)) next.delete(title.id);
      else next.add(title.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkAction(null);
  }, []);

  const editing = useEditMode();

  // Titles added while the Add title dialog is up. They are in the catalog
  // at once (so the dialog knows they are taken) but stay out of the grid
  // until it closes: a card that mounts behind the dialog plays its entrance
  // where nobody can see it, and is simply there afterwards.
  const [heldIds, setHeldIds] = useState<ReadonlySet<CatalogTitle["id"]>>(new Set());
  // The dialog closes itself from a timer that captured an older render, so
  // what to release has to be read from a ref, not from this render's state.
  const heldRef = useRef<Set<CatalogTitle["id"]>>(new Set());

  // Released from the hold: they assemble out of pixels, the way a card
  // dissolves on its way out of the other half.
  const appearingIds = useRef<CatalogTitle["id"][]>([]);
  useLayoutEffect(() => {
    if (appearingIds.current.length === 0) return;
    for (const id of appearingIds.current) {
      const card = cardElement(id);
      if (card) void pixelAppear(card);
    }
    appearingIds.current = [];
  });

  function handleAdded(added: CatalogTitle) {
    setCatalog((prev) => [added, ...prev]);
    if (addTitle.open) {
      heldRef.current.add(added.id);
      setHeldIds(new Set(heldRef.current));
    }
  }

  // The POST already happened by the time this is called — see
  // useDismissRecommendation. Matched the same way recommendationKey()
  // would, but simply by identity: `rec` is the exact object from `recs`.
  function handleDismissed(rec: EnrichedRecommendation) {
    setRecs((prev) => prev.filter((r) => r !== rec));
  }

  // Stable, otherwise TitleCard's memo would be pointless: a fresh function
  // on every render would re-render every card.
  // TitleCard already confirms with the user (ConfirmDialog) before calling
  // this, from both the trash button and the context menu.
  const remove = useCallback(async (title: CatalogTitle) => {
    const res = await send(`/api/titles/${title.id}`, { method: "DELETE" });
    if (!res?.ok) {
      notifyWriteFailed("Could not delete the title.");
      return;
    }
    const card = cardElement(title.id);
    if (card) await pixelDissolve(card);
    setCatalog((prev) => prev.filter((t) => t.id !== title.id));
  }, []);

  const changeSeasons = useCallback(async (title: CatalogTitle, watchedSeasons: number) => {
    const res = await send(`/api/titles/${title.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchedSeasons }),
    });
    if (!res?.ok) {
      notifyWriteFailed("Could not update the title.");
      return;
    }
    // Read it back from the response rather than trusting what was sent: the
    // server clamps to zero and to the known total, so it may have adjusted it.
    const { title: saved } = (await res.json()) as {
      title: { id: number; watchedSeasons: number | null };
    };
    setCatalog((prev) =>
      prev.map((t) =>
        t.id === saved.id ? { ...t, watchedSeasons: saved.watchedSeasons } : t,
      ),
    );
  }, []);

  // Moves a watchlist entry into the watched half. Platform and date come
  // from the dialog: the two things a "to watch" row has no value for yet.
  const markWatched = useCallback(
    async (title: CatalogTitle, platform: string, lastWatchedAt: Date | null) => {
      const res = await send(`/api/titles/${title.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markWatched: {
            platform,
            lastWatchedAt: lastWatchedAt ? lastWatchedAt.toISOString() : undefined,
          },
        }),
      });
      if (!res?.ok) {
        notifyWriteFailed("Could not mark the title as watched.");
        return;
      }
      const { title: updated } = (await res.json()) as {
        title: CatalogTitle & { lastWatchedAt: string | null; createdAt: string };
      };
      // The card comes apart before the state update, so the grid reflows once
      // — with the card already gone — rather than pulling the row out from
      // under an animation still playing on it.
      const card = cardElement(title.id);
      if (card) await pixelDissolve(card);
      // The row stays in the catalog, it just changes half: the grid filters
      // on inWatchlist, so it leaves the watchlist and appears under Watched.
      setCatalog((prev) =>
        prev.map((t) =>
          t.id === updated.id
            ? {
                ...updated,
                lastWatchedAt: updated.lastWatchedAt ? new Date(updated.lastWatchedAt) : null,
                createdAt: new Date(updated.createdAt),
              }
            : t,
        ),
      );
    },
    [],
  );

  // Corrects the platform or watched date on a title already watched (edit
  // mode). Dates round-trip through JSON as strings, so they are coerced
  // back into real Dates here rather than trusted as-is — formatDate() on
  // the card needs an actual Date, not its JSON stand-in.
  const editWatched = useCallback(
    async (
      title: CatalogTitle,
      platform: string,
      lastWatchedAt: Date | null,
      seasons: SeasonEdit | null,
    ) => {
      const res = await send(`/api/titles/${title.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editWatched: {
            platform,
            lastWatchedAt: lastWatchedAt ? lastWatchedAt.toISOString() : null,
            // Absent for a movie, so the season columns are not touched at all.
            ...(seasons ?? {}),
          },
        }),
      });
      if (!res?.ok) {
        notifyWriteFailed("Could not update the title.");
        return;
      }
      const { title: updated } = (await res.json()) as {
        title: CatalogTitle & { lastWatchedAt: string | null; createdAt: string };
      };
      setCatalog((prev) =>
        prev.map((t) =>
          t.id === updated.id
            ? {
                ...updated,
                lastWatchedAt: updated.lastWatchedAt ? new Date(updated.lastWatchedAt) : null,
                createdAt: new Date(updated.createdAt),
              }
            : t,
        ),
      );
    },
    [],
  );

  // Clears the "new season available" badge — the only field this touches,
  // so the update is applied locally rather than round-tripping the whole
  // response through the Date-coercion dance the other PATCHes need.
  const dismissNewSeason = useCallback(async (title: CatalogTitle) => {
    const res = await send(`/api/titles/${title.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissNewSeason: true }),
    });
    if (!res?.ok) {
      notifyWriteFailed("Could not update the title.");
      return;
    }
    setCatalog((prev) =>
      prev.map((t) => (t.id === title.id ? { ...t, newSeasonAvailable: false } : t)),
    );
  }, []);

  /** Sends watched titles back to the watchlist — the way back from
   *  markWatched, which is why it drops the same two fields that one set. */
  const moveToWatchlist = useCallback(async (rows: CatalogTitle[]) => {
    const updated = await Promise.all(
      rows.map(async (t) => {
        const res = await send(`/api/titles/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moveToWatchlist: true }),
        });
        if (!res?.ok) return null;
        const { title } = (await res.json()) as {
          title: CatalogTitle & { lastWatchedAt: string | null; createdAt: string };
        };
        return {
          ...title,
          lastWatchedAt: title.lastWatchedAt ? new Date(title.lastWatchedAt) : null,
          createdAt: new Date(title.createdAt),
        };
      }),
    );
    const byId = new Map(updated.filter((t): t is CatalogTitle => t !== null).map((t) => [t.id, t]));
    if (byId.size < rows.length) {
      notifyWriteFailed(`Could not move ${rows.length - byId.size} of ${rows.length} titles.`);
    }
    // The same going back as coming: this half of the catalog is the one being
    // left, so the card comes apart here too. Only the ones that actually
    // moved — a card whose request failed is still there afterwards.
    const cards = [...byId.keys()].map(cardElement).filter((el): el is HTMLElement => el !== null);
    if (cards.length) await pixelDissolveAll(cards);
    setCatalog((prev) => prev.map((t) => byId.get(t.id) ?? t));
  }, []);

  const moveOneToWatchlist = useCallback(
    (title: CatalogTitle) => void moveToWatchlist([title]),
    [moveToWatchlist],
  );

  /** Deletes everything currently selected, in one pass over the catalog. */
  const bulkDelete = useCallback(async (rows: CatalogTitle[]) => {
    const results = await Promise.all(
      rows.map(async (t) => {
        const res = await send(`/api/titles/${t.id}`, { method: "DELETE" });
        return res?.ok ? t.id : null;
      }),
    );
    const gone = new Set(results.filter((id): id is number => id !== null));
    if (gone.size < rows.length) {
      notifyWriteFailed(`Could not delete ${rows.length - gone.size} of ${rows.length} titles.`);
    }
    const cards = [...gone].map(cardElement).filter((el): el is HTMLElement => el !== null);
    if (cards.length) await pixelDissolveAll(cards);
    setCatalog((prev) => prev.filter((t) => !gone.has(t.id)));
  }, []);

  /** Moves everything selected into the watched half, all on the platform and
   *  date the dialog asked for once. */
  const bulkMarkWatched = useCallback(
    async (rows: CatalogTitle[], platform: string, lastWatchedAt: Date | null) => {
      const updated = await Promise.all(
        rows.map(async (t) => {
          const res = await send(`/api/titles/${t.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              markWatched: {
                platform,
                lastWatchedAt: lastWatchedAt ? lastWatchedAt.toISOString() : undefined,
              },
            }),
          });
          if (!res?.ok) return null;
          const { title } = (await res.json()) as {
            title: CatalogTitle & { lastWatchedAt: string | null; createdAt: string };
          };
          return {
            ...title,
            lastWatchedAt: title.lastWatchedAt ? new Date(title.lastWatchedAt) : null,
            createdAt: new Date(title.createdAt),
          };
        }),
      );
      const byId = new Map(updated.filter((t): t is CatalogTitle => t !== null).map((t) => [t.id, t]));
      if (byId.size < rows.length) {
        notifyWriteFailed(`Could not update ${rows.length - byId.size} of ${rows.length} titles.`);
      }
      // Only the ones that actually moved: a card whose request failed is
      // still there afterwards, and must not be shown leaving.
      const cards = [...byId.keys()]
        .map(cardElement)
        .filter((el): el is HTMLElement => el !== null);
      if (cards.length) await pixelDissolveAll(cards);
      setCatalog((prev) => prev.map((t) => byId.get(t.id) ?? t));
    },
    [],
  );

  const filtered = useMemo(() => {
    const words = searchWords(deferredQ);
    // A finished semantic/AI search stands in for the title match below: it
    // already decided which rows the query is about, beyond their title.
    const searchIds =
      aiSearch?.status === "done"
        ? new Set(aiSearch.ids)
        : semanticSearch?.status === "done"
          ? new Set(semanticSearch.ids)
          : null;
    return catalog.filter((t) => {
      if (t.inWatchlist !== (mode === "watchlist")) return false;
      if (platform && t.platform !== platform) return false;
      if (mediaType && t.mediaType !== mediaType) return false;
      if (genre && !splitGenres(t.genres).includes(genre)) {
        return false;
      }
      if (searchIds) return searchIds.has(t.id);
      // Search the current half of the catalog; discovery lives in Add title.
      if (words.length && !matchesSearchWords(t.searchTitle, words)) {
        return false;
      }
      return true;
    });
  }, [catalog, deferredQ, mode, platform, mediaType, genre, semanticSearch, aiSearch]);

  // Every genre actually present in the catalog, alphabetized — not a fixed
  // list like platforms, since which genres exist depends entirely on what
  // was watched.
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    for (const t of catalog) {
      for (const g of splitGenres(t.genres)) {
        set.add(g);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  // Deliberately leaves the filter pickers alone: having a search quietly
  // switch the platform or genre chips underneath you is disorienting, and
  // it also narrows whatever you search next.
  const runSemanticSearch = useCallback(
    async (query: string) => {
      const pending = { query, mode, ids: [] };
      setSemanticSearchAttempt({ ...pending, status: "loading" });
      try {
        const res = await fetch("/api/search/semantic", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, mode }),
        });
        if (!res.ok) {
          setSemanticSearchAttempt({ ...pending, status: "error" });
          return;
        }
        const data = (await res.json()) as { ids?: number[] };
        setSemanticSearchAttempt({ ...pending, status: "done", ids: data.ids ?? [] });
      } catch {
        setSemanticSearchAttempt({ ...pending, status: "error" });
      }
    },
    [mode],
  );

  const runAiSearch = useCallback(
    async (query: string) => {
      const pending = { query, mode, ids: [] };
      setAiSearchAttempt({ ...pending, status: "loading" });
      try {
        const res = await fetch("/api/search/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, mode }),
        });
        if (!res.ok) {
          setAiSearchAttempt({ ...pending, status: "error" });
          return;
        }
        const data = (await res.json()) as { ids?: number[] };
        setAiSearchAttempt({
          ...pending,
          status: "done",
          ids: data.ids ?? [],
        });
      } catch {
        setAiSearchAttempt({ ...pending, status: "error" });
      }
    },
    [mode],
  );

  // Both halves at once: a recommendation is "already yours" whether it is
  // waiting on the watchlist or was watched years ago.
  const savedTitles = useMemo(() => new TitleIdentityIndex(catalog), [catalog]);

  const titles = useMemo(() => {
    const arr = [...filtered];
    switch (sort) {
      case "title":
        arr.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "rating":
        arr.sort(
          (a, b) => (b.tmdbRating ?? -1) - (a.tmdbRating ?? -1) || a.title.localeCompare(b.title),
        );
        break;
      case "year":
        arr.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title));
        break;
      case "recent":
      default:
        // Watchlist entries have never been watched, so for those this falls
        // back to when they were added — most recently saved first.
        arr.sort((a, b) => {
          const dateB = new Date(b.lastWatchedAt ?? b.createdAt).getTime();
          const dateA = new Date(a.lastWatchedAt ?? a.createdAt).getTime();
          return dateB - dateA || a.title.localeCompare(b.title);
        });
    }
    return arr;
  }, [filtered, sort]);

  // Keyed by what is being shown rather than reset through an effect: change
  // the filters, the search or the sort and the key stops matching, which is
  // itself the reset back to the first page.
  const resultKey = `${mode}|${platform}|${mediaType}|${genre}|${sort}|${trimmedQuery}|${
    semanticSearch?.status === "done" ? semanticSearch.ids.join(",") : ""
  }|${
    aiSearch?.status === "done" ? aiSearch.ids.join(",") : ""
  }`;
  const [page, setPage] = useState({ key: resultKey, count: PAGE_SIZE });
  const shownCount = page.key === resultKey ? page.count : PAGE_SIZE;
  const shownTitles = titles.filter((t) => !heldIds.has(t.id)).slice(0, shownCount);
  // Only in the "to watch" half: for something already watched the platform
  // is recorded, and where it happens to be streaming today is noise.
  const providers = useWatchProviders(mode === "watchlist" ? shownTitles : null, region);
  // Resolved against the visible results, so changing a filter narrows the
  // selection to what is still on screen rather than acting on rows the
  // reader can no longer see.
  const selectedTitles = useMemo(
    () => (selectedIds.size === 0 ? [] : titles.filter((t) => selectedIds.has(t.id))),
    [titles, selectedIds],
  );
  const hasMore = titles.length > shownTitles.length;

  // Grows the grid as its end comes into view. The observer is watched rather
  // than the scroll position so it costs nothing while the user is reading,
  // and the margin means the next batch is already in place by the time they
  // reach it.
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setPage((prev) => ({
              key: resultKey,
              count: (prev.key === resultKey ? prev.count : PAGE_SIZE) + PAGE_SIZE,
            }));
          }
        },
        { rootMargin: "800px" },
      );
      observer.observe(node);
      return () => observer.disconnect();
    },
    [resultKey],
  );
  // Natural-language search is local and works in either saved half. Claude
  // remains a second pass for Watched when configured; discovery still lives
  // in Add title rather than changing watchlist search into TMDB search.
  const showSemanticSearchHint = trimmedQuery !== "" && shownTitles.length === 0;
  const semanticFoundNothing = semanticSearch?.status === "done" && shownTitles.length === 0;
  const aiFoundNothing = aiSearch?.status === "done" && shownTitles.length === 0;
  const modeTotal = useMemo(
    () => catalog.filter((t) => t.inWatchlist === (mode === "watchlist")).length,
    [catalog, mode],
  );

  return (
    // Extra bottom room while the compact header is in use: the Watched /
    // To watch pill floats over the bottom of the viewport there and would
    // otherwise cover the last row. Same breakpoint as the pill itself, in
    // FilterBar — they have to change together.
    <main className="w-full px-3 pb-28 pt-6 sm:px-5 lg:pb-16">
      <FilterBar
        total={modeTotal}
        filteredTotal={titles.length}
        q={q}
        onQChange={setQ}
        mode={mode}
        onModeChange={(next) => {
          clearSelection();
          setMode(next);
        }}
        platform={platform}
        onPlatformChange={setPlatform}
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
        genre={genre}
        onGenreChange={setGenre}
        availableGenres={availableGenres}
        sort={sort}
        onSortChange={setSort}
        semanticSearchHint={
          showSemanticSearchHint
            ? {
                status:
                  aiSearch?.status === "loading" || aiSearch?.status === "error"
                    ? aiSearch.status
                    : semanticSearch?.status === "loading" || semanticSearch?.status === "error"
                      ? semanticSearch.status
                      : "idle",
                source:
                  aiSearch?.status === "loading" || aiSearch?.status === "error" ? "ai" : "local",
                semanticTried: semanticFoundNothing,
                aiTried: aiFoundNothing,
                canTryAi: aiSearchEnabled && mode === "watched" && semanticFoundNothing,
              }
            : null
        }
        onSemanticSearch={() => runSemanticSearch(trimmedQuery)}
        onAiSearch={() => runAiSearch(trimmedQuery)}
        onAddTitle={() => setAddTitle({ open: true, initialQuery: "", initialDestination: null })}
      />

      {addTitle.open && (
        <AddTitleCard
          open
          onOpenChange={(open) => {
            setAddTitle((current) => ({ ...current, open }));
            if (!open) {
              appearingIds.current = [...heldRef.current];
              heldRef.current = new Set();
              setHeldIds(new Set());
            }
          }}
          initialQuery={addTitle.initialQuery}
          initialDestination={addTitle.initialDestination}
          savedTitles={savedTitles}
          onAdded={handleAdded}
        />
      )}

      {/* "To watch" gets the recommendations as a strip you add from, not as
          a tile you open: here the list is something to pick from. Above the
          grid rather than in it, so it is also there when the watchlist is
          still empty — which is exactly when it is most useful. */}
      {mode === "watchlist" && !trimmedQuery && !platform && !mediaType && (
        <RecommendationsRow
          titles={recs}
          savedTitles={savedTitles}
          onAdded={handleAdded}
          onDismissed={handleDismissed}
        />
      )}

      {shownTitles.length === 0 && !deferredQ.trim() ? (
        !platform && !mediaType && !genre ? (
          <EmptyCatalog
            mode={mode === "watchlist" ? "watchlist" : "watched"}
            onAddTitle={() => setAddTitle({ open: true, initialQuery: "", initialDestination: mode })}
          />
        ) : (
          <p className="mt-16 text-center text-muted">No titles match these filters.</p>
        )
      ) : (
        <div className="title-grid grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4">
          {deferredQ.trim() && (
            <AddTitleCardTrigger
              onClick={() =>
                setAddTitle({ open: true, initialQuery: deferredQ.trim(), initialDestination: mode })
              }
            />
          )}
          {/* Only in the unfiltered default view — a taste-based suggestion
              tile would be out of place mixed into filtered/search results. */}
          {mode === "watched" && !platform && !mediaType && !deferredQ.trim() && (
            <RecommendationsCard
              titles={recs}
              savedTitles={savedTitles}
              onAdded={handleAdded}
              onDismissed={handleDismissed}
            />
          )}
          {shownTitles.map((t, i) => (
            <TitleCard
              key={t.id}
              title={t}
              priority={i < 12}
              editing={editing}
              onRemove={remove}
              onSeasons={changeSeasons}
              onMarkWatched={markWatched}
              onEditWatched={editWatched}
              onDismissNewSeason={dismissNewSeason}
              onMoveToWatchlist={moveOneToWatchlist}
              selected={selectedIds.has(t.id)}
              selectionActive={selectedTitles.length > 0}
              onToggleSelect={toggleSelect}
              watchProviders={t.tmdbId ? providers[watchProviderKey(region, { tmdbId: t.tmdbId, mediaType: t.mediaType })] : undefined}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={loadMoreRef} className="mt-8 text-center text-xs text-muted">
          Loading more... ({shownTitles.length.toLocaleString("en-US")} of{" "}
          {titles.length.toLocaleString("en-US")})
        </div>
      )}

      {selectedTitles.length > 0 && (
        <SelectionBar
          count={selectedTitles.length}
          onMarkWatched={
            mode === "watchlist" ? () => setBulkAction("watched") : undefined
          }
          onMoveToWatchlist={
            mode === "watched" ? () => setBulkAction("towatch") : undefined
          }
          onDelete={() => setBulkAction("delete")}
          onClear={clearSelection}
        />
      )}

      {bulkAction === "watched" && selectedTitles.length > 0 && (
        <MarkWatchedDialog
          titles={selectedTitles}
          onConfirm={(platform, lastWatchedAt) => {
            const rows = selectedTitles;
            clearSelection();
            void bulkMarkWatched(rows, platform, lastWatchedAt);
          }}
          onCancel={() => setBulkAction(null)}
        />
      )}

      {bulkAction === "towatch" && selectedTitles.length > 0 && (
        <ConfirmDialog
          title={`Move ${selectedTitles.length} titles to "To watch"?`}
          description={`Where and when you watched ${
            selectedTitles.length === 1 ? "it" : "them"
          } will be cleared — that is what "not watched yet" means here.`}
          confirmLabel="Move"
          onConfirm={() => {
            const rows = selectedTitles;
            clearSelection();
            void moveToWatchlist(rows);
          }}
          onCancel={() => setBulkAction(null)}
        />
      )}

      {bulkAction === "delete" && selectedTitles.length > 0 && (
        <ConfirmDialog
          title={`Delete ${selectedTitles.length} titles?`}
          description={`${selectedTitles
            .slice(0, 5)
            .map((t) => `"${t.title}"`)
            .join(", ")}${
            selectedTitles.length > 5 ? ` and ${selectedTitles.length - 5} more` : ""
          } will be removed from your catalog. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            const rows = selectedTitles;
            clearSelection();
            void bulkDelete(rows);
          }}
          onCancel={() => setBulkAction(null)}
        />
      )}
    </main>
  );
}
