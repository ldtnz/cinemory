"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Title } from "@prisma/client";
import FilterBar from "@/components/FilterBar";
import TitleCard from "@/components/TitleCard";
import AddTitleCard from "@/components/AddTitleCard";
import DiscoverCard from "@/components/DiscoverCard";
import ImportHistory from "@/components/ImportHistory";
import RecommendationsCard from "@/components/RecommendationsCard";
import RecommendationsRow from "@/components/RecommendationsRow";
import type { EnrichedRecommendation } from "@/lib/recommendations";
import type { TmdbCandidate } from "@/lib/tmdb";
import { normalizeTitle } from "@/lib/title-key";
import type { WatchMode } from "@/lib/watch-mode";
import { useEditMode } from "@/lib/edit-mode";

const MAX_SHOWN = 1500;

export default function Catalog({
  initialTitles,
  recommendations = [],
}: {
  initialTitles: Title[];
  recommendations?: EnrichedRecommendation[];
}) {
  // The catalog lives in component state (not just as a prop) so new titles
  // can be added without reloading the page.
  const [catalog, setCatalog] = useState(initialTitles);

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
  const [sort, setSort] = useState("recent");

  // Searching the watchlist searches TMDB, not the catalog: the point there
  // is to find something new to add, not to filter what is already saved.
  const [discovered, setDiscovered] = useState<TmdbCandidate[]>([]);
  const [discoveredFor, setDiscoveredFor] = useState<string | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  const editing = useEditMode();

  function handleAdded(added: Title) {
    setCatalog((prev) => [added, ...prev]);
  }

  const discoverQuery = mode === "watchlist" ? deferredQ.trim() : "";

  // Same shape as AddTitleCard's search: debounced, each round cancelling the
  // previous one, and every setState inside the timeout rather than in the
  // effect body so a slow response can never overwrite a newer one.
  useEffect(() => {
    if (mode !== "watchlist") return;

    let cancelled = false;
    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      if (!discoverQuery) {
        setDiscovered([]);
        setDiscoverError(null);
        setDiscoveredFor("");
        return;
      }
      try {
        const res = await fetch(
          `/api/tmdb-search?perType=20&q=${encodeURIComponent(discoverQuery)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { results: TmdbCandidate[] };
        if (cancelled) return;
        setDiscovered(data.results);
        setDiscoverError(null);
      } catch {
        if (!cancelled) {
          setDiscovered([]);
          setDiscoverError("Search failed.");
        }
      } finally {
        // On error too: without this it would say "Searching..." forever.
        if (!cancelled) setDiscoveredFor(discoverQuery);
      }
    }, discoverQuery ? 350 : 0);

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [mode, discoverQuery]);

  // Stable, otherwise TitleCard's memo would be pointless: a fresh function
  // on every render would re-render every card.
  // TitleCard already confirms with the user (ConfirmDialog) before calling
  // this, from both the trash button and the context menu.
  const remove = useCallback(async (title: Title) => {
    const res = await fetch(`/api/titles/${title.id}`, { method: "DELETE" });
    if (!res.ok) {
      window.alert("Could not delete the title.");
      return;
    }
    setCatalog((prev) => prev.filter((t) => t.id !== title.id));
  }, []);

  const changeSeasons = useCallback(async (title: Title, watchedSeasons: number) => {
    const res = await fetch(`/api/titles/${title.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchedSeasons }),
    });
    if (!res.ok) return;
    // Read it back from the response rather than trusting what was sent: the
    // server clamps to zero and to the known total, so it may have adjusted it.
    const { title: aggiornato } = (await res.json()) as {
      title: { id: number; watchedSeasons: number | null };
    };
    setCatalog((prev) =>
      prev.map((t) =>
        t.id === aggiornato.id ? { ...t, watchedSeasons: aggiornato.watchedSeasons } : t,
      ),
    );
  }, []);

  // Moves a watchlist entry into the watched half. The platform comes from
  // the dialog: it is the one thing a "to watch" row has no value for yet.
  const markWatched = useCallback(async (title: Title, platform: string) => {
    const res = await fetch(`/api/titles/${title.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markWatched: { platform } }),
    });
    if (!res.ok) {
      window.alert("Could not mark the title as watched.");
      return;
    }
    const { title: updated } = (await res.json()) as { title: Title };
    // The row stays in the catalog, it just changes half: the grid filters on
    // inWatchlist, so it leaves the watchlist and appears under Watched.
    setCatalog((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }, []);

  const filtered = useMemo(() => {
    const query = deferredQ.trim().toLowerCase();
    return catalog.filter((t) => {
      if (t.inWatchlist !== (mode === "watchlist")) return false;
      if (platform && t.platform !== platform) return false;
      if (mediaType && t.mediaType !== mediaType) return false;
      // In watchlist mode the query drives the TMDB search below instead of
      // filtering the saved list, so it is deliberately ignored here.
      if (mode === "watched" && query && !t.searchTitle.includes(query)) return false;
      return true;
    });
  }, [catalog, deferredQ, mode, platform, mediaType]);

  // What is already watched must not come back as something to add. Matched
  // on TMDB id where there is one, and on the normalized title otherwise —
  // imported rows that never got a TMDB match still count as watched.
  const watchedKeys = useMemo(() => {
    const tmdbIds = new Set<number>();
    const titleKeys = new Set<string>();
    for (const t of catalog) {
      if (t.inWatchlist) continue;
      if (t.tmdbId && t.tmdbId > 0) tmdbIds.add(t.tmdbId);
      titleKeys.add(t.searchTitle);
    }
    return { tmdbIds, titleKeys };
  }, [catalog]);

  const watchlistKeys = useMemo(() => {
    const tmdbIds = new Set<number>();
    for (const t of catalog) {
      if (t.inWatchlist && t.tmdbId && t.tmdbId > 0) tmdbIds.add(t.tmdbId);
    }
    return tmdbIds;
  }, [catalog]);

  // Both halves at once: a recommendation is "already yours" whether it is
  // waiting on the watchlist or was watched years ago.
  const savedKeys = useMemo(() => {
    const tmdbIds = new Set<number>();
    const titleKeys = new Set<string>();
    for (const t of catalog) {
      if (t.tmdbId && t.tmdbId > 0) tmdbIds.add(t.tmdbId);
      titleKeys.add(t.searchTitle);
    }
    return { tmdbIds, titleKeys };
  }, [catalog]);

  const discoverResults = useMemo(
    () =>
      discovered.filter(
        (c) =>
          !watchedKeys.tmdbIds.has(c.tmdbId) &&
          !watchedKeys.titleKeys.has(normalizeTitle(c.title)),
      ),
    [discovered, watchedKeys],
  );

  const discovering = discoverQuery !== "" && discoveredFor !== discoverQuery;

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

  const shownTitles = titles.slice(0, MAX_SHOWN);
  // With a query, the watchlist grid becomes TMDB results to add rather than
  // the saved list.
  const discoverMode = mode === "watchlist" && discoverQuery !== "";
  const modeTotal = useMemo(
    () => catalog.filter((t) => t.inWatchlist === (mode === "watchlist")).length,
    [catalog, mode],
  );

  if (catalog.length === 0) {
    return (
      <main className="mx-auto w-full max-w-lg px-3 pb-16 pt-10 sm:px-5">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Welcome to Cinemory</h1>
          <p className="mt-1.5 text-sm text-muted">
            Your catalog is empty. Import your Netflix or Prime Video watch history to get
            started.
          </p>
        </div>
        {/* A full reload rather than router.refresh(): this component's
            catalog state was seeded from initialTitles once, at mount, and
            would not otherwise pick up the server's fresh data. Fine for a
            transition that only ever happens once, going from an empty
            catalog to a populated one. */}
        <ImportHistory onImported={() => window.location.reload()} />
      </main>
    );
  }

  return (
    // Extra bottom room on mobile: the Watched / To watch pill floats over
    // the bottom of the viewport there and would otherwise cover the last row.
    <main className="w-full px-3 pb-28 pt-6 sm:px-5 sm:pb-16">
      <FilterBar
        total={modeTotal}
        filteredTotal={titles.length}
        countLabel={
          discoverMode
            ? discovering
              ? "Searching TMDB..."
              : `${discoverResults.length} to add`
            : undefined
        }
        q={q}
        onQChange={setQ}
        mode={mode}
        onModeChange={setMode}
        platform={platform}
        onPlatformChange={setPlatform}
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
        sort={sort}
        onSortChange={setSort}
      />

      {/* "To watch" gets the recommendations as a strip you add from, not as
          a tile you open: here the list is something to pick from. Above the
          grid rather than in it, so it is also there when the watchlist is
          still empty — which is exactly when it is most useful. */}
      {mode === "watchlist" && !discoverMode && !platform && !mediaType && (
        <RecommendationsRow
          titles={recommendations}
          savedTmdbIds={savedKeys.tmdbIds}
          savedTitleKeys={savedKeys.titleKeys}
          onAdded={handleAdded}
        />
      )}

      {discoverMode ? (
        discovering && discoverResults.length === 0 ? (
          <p className="mt-16 text-center text-muted">Searching TMDB...</p>
        ) : discoverError ? (
          <p className="mt-16 text-center text-muted">{discoverError}</p>
        ) : discoverResults.length === 0 ? (
          <p className="mt-16 text-center text-muted">
            {discovered.length > 0
              ? "Everything matching this search is already in your watched list."
              : "No results. Try another title."}
          </p>
        ) : (
          <div className="title-grid grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4">
            {discoverResults.map((c, i) => (
              <DiscoverCard
                key={`${c.mediaType}-${c.tmdbId}`}
                candidate={c}
                alreadyOnWatchlist={watchlistKeys.has(c.tmdbId)}
                priority={i < 12}
                onAdded={handleAdded}
              />
            ))}
          </div>
        )
      ) : shownTitles.length === 0 && !deferredQ.trim() ? (
        <p className="mt-16 text-center text-muted">
          {mode === "watchlist"
            ? "Nothing to watch yet. Search for a title to add it here."
            : "No titles match these filters."}
        </p>
      ) : (
        <div className="title-grid grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4">
          {deferredQ.trim() && (
            <AddTitleCard initialQuery={deferredQ.trim()} onAdded={handleAdded} />
          )}
          {/* Only in the unfiltered default view — a taste-based suggestion
              tile would be out of place mixed into filtered/search results. */}
          {mode === "watched" && !platform && !mediaType && !deferredQ.trim() && (
            <RecommendationsCard titles={recommendations} />
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
            />
          ))}
        </div>
      )}

      {!discoverMode && titles.length > shownTitles.length && (
        <p className="mt-8 text-center text-xs text-muted">
          Showing the first {shownTitles.length} of {titles.length} results.
          Refine your search to narrow it down.
        </p>
      )}
    </main>
  );
}
