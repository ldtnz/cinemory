"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { Title } from "@prisma/client";
import FilterBar from "@/components/FilterBar";
import TitleCard from "@/components/TitleCard";
import AddTitleCard from "@/components/AddTitleCard";
import ImportHistory from "@/components/ImportHistory";
import { useEditMode } from "@/lib/edit-mode";

const MAX_SHOWN = 1500;

export default function Catalog({ initialTitles }: { initialTitles: Title[] }) {
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
  const [platform, setPlatform] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [sort, setSort] = useState("recent");

  const editing = useEditMode();

  function handleAdded(added: Title) {
    setCatalog((prev) => [added, ...prev]);
  }

  // Stable, otherwise TitleCard's memo would be pointless: a fresh function
  // on every render would re-render every card.
  const remove = useCallback(async (title: Title) => {
    if (!window.confirm(`Delete "${title.title}" from the catalog?`)) return;

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

  const filtered = useMemo(() => {
    const query = deferredQ.trim().toLowerCase();
    return catalog.filter((t) => {
      if (platform && t.platform !== platform) return false;
      if (mediaType && t.mediaType !== mediaType) return false;
      if (query && !t.searchTitle.includes(query)) return false;
      return true;
    });
  }, [catalog, deferredQ, platform, mediaType]);

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
        arr.sort((a, b) => {
          const dateB = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : 0;
          const dateA = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : 0;
          return dateB - dateA || a.title.localeCompare(b.title);
        });
    }
    return arr;
  }, [filtered, sort]);

  const shownTitles = titles.slice(0, MAX_SHOWN);

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
    <main className="w-full px-3 pb-16 pt-6 sm:px-5">
      <FilterBar
        total={catalog.length}
        filteredTotal={titles.length}
        q={q}
        onQChange={setQ}
        platform={platform}
        onPlatformChange={setPlatform}
        mediaType={mediaType}
        onMediaTypeChange={setMediaType}
        sort={sort}
        onSortChange={setSort}
      />

      {shownTitles.length === 0 && !deferredQ.trim() ? (
        <p className="mt-16 text-center text-muted">
          No titles match these filters.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] sm:gap-4">
          {deferredQ.trim() && (
            <AddTitleCard initialQuery={deferredQ.trim()} onAdded={handleAdded} />
          )}
          {shownTitles.map((t, i) => (
            <TitleCard
              key={t.id}
              title={t}
              priority={i < 12}
              editing={editing}
              onRemove={remove}
              onSeasons={changeSeasons}
            />
          ))}
        </div>
      )}

      {titles.length > shownTitles.length && (
        <p className="mt-8 text-center text-xs text-muted">
          Showing the first {shownTitles.length} of {titles.length} results.
          Refine your search to narrow it down.
        </p>
      )}
    </main>
  );
}
