"use client";

import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";
import { Minus, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Title } from "@prisma/client";
import { setEditMode } from "@/lib/edit-mode";
import { useCardContextMenu } from "@/lib/use-card-context-menu";
import ConfirmDialog from "@/components/ConfirmDialog";
import TitleContextMenu from "@/components/TitleContextMenu";
import MarkWatchedDialog from "@/components/MarkWatchedDialog";
import EditWatchedDialog from "@/components/EditWatchedDialog";
import TrailerModal from "@/components/TrailerModal";

function MissingPosterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="relative h-6 w-6 text-muted" aria-hidden>
      <path
        d="M4 8.5 5.5 5h13L20 8.5M4 8.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8.5M4 8.5h16"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m8 5 1.6 3.5M13 5l1.6 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatDate(data: Date | null): string {
  if (!data) return "";
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
}

const PLATFORM_STYLES: Record<string, { color: string; label: string }> = {
  Netflix: { color: "text-red-400", label: "Netflix" },
  "Amazon Prime Video": { color: "text-sky-400", label: "Prime Video" },
  "Disney+": { color: "text-blue-400", label: "Disney+" },
  "Apple TV+": { color: "text-zinc-300", label: "Apple TV+" },
  Max: { color: "text-purple-400", label: "Max" },
  "Paramount+": { color: "text-indigo-400", label: "Paramount+" },
  Peacock: { color: "text-fuchsia-400", label: "Peacock" },
  Hulu: { color: "text-lime-400", label: "Hulu" },
  YouTube: { color: "text-rose-400", label: "YouTube" },
  Crunchyroll: { color: "text-yellow-400", label: "Crunchyroll" },
  "Sky / NOW": { color: "text-cyan-400", label: "Sky / NOW" },
  RaiPlay: { color: "text-orange-400", label: "RaiPlay" },
  "Mediaset Infinity": { color: "text-pink-400", label: "Mediaset Infinity" },
  TIMvision: { color: "text-teal-400", label: "TIMvision" },
  "Rakuten TV": { color: "text-emerald-400", label: "Rakuten TV" },
  Cinema: { color: "text-amber-400", label: "Cinema" },
  TV: { color: "text-slate-400", label: "TV broadcast" },
  Unknown: { color: "text-neutral-500", label: "Not sure" },
};

function TitleCard({
  title,
  priority = false,
  editing = false,
  onRemove,
  onSeasons,
  onMarkWatched,
  onEditWatched,
  onDismissNewSeason,
}: {
  title: Title;
  /** true for the first cards above the fold, avoids the Next/Image LCP warning */
  priority?: boolean;
  /** edit mode on: shows the delete button */
  editing?: boolean;
  onRemove?: (title: Title) => void;
  onSeasons?: (title: Title, watchedSeasons: number) => void;
  /** Moves a watchlist entry into the watched half, on the chosen platform. */
  onMarkWatched?: (title: Title, platform: string, lastWatchedAt: Date | null) => void;
  /** Corrects the platform or watched date on an already-watched title. */
  onEditWatched?: (title: Title, platform: string, lastWatchedAt: Date | null) => void;
  /** Clears the "new season available" badge (src/lib/season-check.ts). */
  onDismissNewSeason?: (title: Title) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [markingWatched, setMarkingWatched] = useState(false);
  const [editingWatched, setEditingWatched] = useState(false);
  const [trailer, setTrailer] = useState<{ loading: boolean; key: string | null } | null>(null);
  // Tapping a poster on touch shows the details overlay that desktop gets on
  // hover, then hides it again after a few seconds — touch has no hover.
  const [tapDetailsVisible, setTapDetailsVisible] = useState(false);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { cardRef, menuPos, closeContextMenu, longPressFiredRef, cardHandlers } =
    useCardContextMenu<HTMLDivElement>();

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  function requestDelete() {
    setConfirmingDelete(true);
  }

  async function openTrailer() {
    setTrailer({ loading: true, key: null });
    try {
      const params = new URLSearchParams({
        tmdbId: String(title.tmdbId),
        mediaType: title.mediaType,
      });
      const res = await fetch(`/api/trailer?${params}`);
      const data = (await res.json()) as { trailerKey?: string | null };
      setTrailer({ loading: false, key: res.ok ? (data.trailerKey ?? null) : null });
    } catch {
      setTrailer({ loading: false, key: null });
    }
  }

  function handleTap() {
    // The tap that ends a long-press still fires a click on release: this
    // one should open the menu, not also flash the details overlay.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (!title.posterUrl) return;
    setTapDetailsVisible(true);
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    tapTimeoutRef.current = setTimeout(() => setTapDetailsVisible(false), 5000);
  }

  const platformStyle = PLATFORM_STYLES[title.platform] ?? {
    color: "text-muted",
    label: title.platform,
  };
  const platformColor = platformStyle.color;
  const platformLabel = platformStyle.label;
  // "2 of 5 seasons", or only what is known: TMDB does not always give the
  // total and the exports do not always name the season.
  const seasonsLabel =
    title.mediaType !== "Series"
      ? null
      : title.watchedSeasons != null && title.totalSeasons != null
        ? `${title.watchedSeasons} of ${title.totalSeasons} seasons`
        : title.watchedSeasons != null
          ? `${title.watchedSeasons} ${title.watchedSeasons === 1 ? "season watched" : "seasons watched"}`
          : title.totalSeasons != null
            ? `${title.totalSeasons} ${title.totalSeasons === 1 ? "season" : "seasons"}`
            : null;

  const subtitle = [
    title.mediaType,
    title.year ?? (title.lastWatchedAt ? formatDate(title.lastWatchedAt) : null),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={cardRef}
      className="title-card group relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2"
      onClick={handleTap}
      {...cardHandlers}
    >
      {title.posterUrl ? (
        <>
          {/* pulsing skeleton until the poster has loaded */}
          <div
            className={`absolute inset-0 animate-pulse bg-surface-2 transition-opacity duration-300 ${
              loaded ? "opacity-0" : "opacity-100"
            }`}
            aria-hidden
          />
          <Image
            src={title.posterUrl}
            alt={title.title}
            fill
            unoptimized
            sizes="(max-width: 640px) 30vw, (max-width: 1024px) 16vw, 10vw"
            // pointer-events-none: iOS Safari runs its own long-press
            // gesture recognizer on <img> elements (deciding whether to show
            // its native Save Image sheet) before it hands touch events to
            // the page, adding several seconds of delay. Taking the <img>
            // out of hit-testing means the touch lands on this div instead,
            // which has no such recognizer.
            className={`pointer-events-none object-cover transition-opacity duration-300 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            priority={priority}
            loading={priority ? "eager" : "lazy"}
            draggable={false}
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-3 text-center text-muted">
          <div
            className="absolute -inset-6 rounded-full bg-surface/80 blur-2xl"
            aria-hidden
          />
          <MissingPosterIcon />
          <span className="relative line-clamp-4 text-[10.5px] leading-tight">
            {title.title}
          </span>
        </div>
      )}

      {/* A new season landed since totalSeasons was last checked (see
          src/lib/season-check.ts) — persistently visible, not hover-gated
          like the rest of the card's overlays, since the point is to catch
          the eye without making the user hover every poster to find it.
          Hidden in edit mode, where the Edit button already owns this
          corner. */}
      {!editing && title.newSeasonAvailable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismissNewSeason?.(title);
          }}
          aria-label={`New season available for ${title.title} — tap to dismiss`}
          title="New season available — tap to dismiss"
          className="absolute left-1.5 top-1.5 z-10 flex items-center gap-1 rounded-lg bg-accent-2 px-2 py-1 text-[10px] font-semibold text-background shadow-[0_4px_12px_-2px_rgba(0,0,0,0.5)]"
        >
          <Sparkles className="h-3 w-3" strokeWidth={2.2} />
          New season
        </button>
      )}

      {/* Not on the watchlist: nothing watched yet to correct the platform
          or date on — that's what "mark as watched", from the context menu,
          is for. */}
      {editing && !title.inWatchlist && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingWatched(true);
          }}
          aria-label={`Edit ${title.title}`}
          title={`Edit ${title.title}`}
          // Same black already used for the recommendation badges — opposite
          // corner from Delete, same hover-reveal treatment.
          className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 transition-opacity duration-150 hover:bg-black/85 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}

      {editing && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            requestDelete();
          }}
          aria-label={`Delete ${title.title}`}
          title={`Delete ${title.title}`}
          // Touch has no hover, but the right-click/long-press menu (Edit
          // and Delete, wired below) works there regardless of edit mode.
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-red-500 text-white opacity-0 transition-opacity duration-150 hover:bg-red-400 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}

      {/* Not on the watchlist: nothing has been watched yet, so there is no
          season progress to adjust — only how many are already out (TMDB),
          which isn't user-editable. */}
      {editing && title.mediaType === "Series" && !title.inWatchlist && (
        <div className="absolute inset-x-1.5 bottom-1.5 z-10 flex items-center justify-between rounded-lg bg-black/85 px-1 py-1 backdrop-blur-sm">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeasons?.(title, Math.max(0, (title.watchedSeasons ?? 0) - 1));
            }}
            disabled={(title.watchedSeasons ?? 0) <= 0}
            aria-label={`One season fewer for ${title.title}`}
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-white/10 text-white disabled:opacity-30"
          >
            <Minus className="h-3 w-3" strokeWidth={2.5} />
          </button>
          <span className="px-1 text-center text-[10px] font-semibold leading-tight text-white">
            {title.watchedSeasons ?? 0}
            {title.totalSeasons != null ? `/${title.totalSeasons}` : ""}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeasons?.(title, (title.watchedSeasons ?? 0) + 1);
            }}
            aria-label={`One season more for ${title.title}`}
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-white/10 text-white"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* details overlay, shown on hover (always when there is no poster: the title is already displayed above) */}
      {title.posterUrl && (
        <div
          className={`title-card__details pointer-events-none absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2.5 pt-7 opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${
            tapDetailsVisible ? "opacity-100" : ""
          }`}
        >
          <p className="line-clamp-2 text-[11px] font-medium leading-tight text-white">
            {title.title}
          </p>
          <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-300">
            <span className="truncate">{subtitle}</span>
            {title.tmdbRating ? (
              <span className="ml-1 flex-none font-semibold text-amber-400">
                ★ {title.tmdbRating.toFixed(1)}
              </span>
            ) : null}
          </div>
          {/* Watchlist entries have no platform yet — nothing to show. */}
          {platformLabel && (
            <p className={`mt-0.5 text-[10px] font-semibold ${platformColor}`}>
              {platformLabel}
            </p>
          )}
          {seasonsLabel && (
            <p className="mt-0.5 text-[10px] text-neutral-400">{seasonsLabel}</p>
          )}
        </div>
      )}

      {menuPos && (
        <TitleContextMenu
          x={menuPos.x}
          y={menuPos.y}
          editing={editing}
          hasTrailerSource={Boolean(title.tmdbId && title.tmdbId > 0)}
          onWatchlist={title.inWatchlist}
          onTrailer={openTrailer}
          onMarkWatched={() => setMarkingWatched(true)}
          onToggleEdit={() => setEditMode(!editing)}
          onDelete={requestDelete}
          onClose={closeContextMenu}
        />
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this title?"
          description={`"${title.title}" will be removed from your catalog. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            setConfirmingDelete(false);
            onRemove?.(title);
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {markingWatched && (
        <MarkWatchedDialog
          title={title}
          onConfirm={(platform, lastWatchedAt) => {
            setMarkingWatched(false);
            onMarkWatched?.(title, platform, lastWatchedAt);
          }}
          onCancel={() => setMarkingWatched(false)}
        />
      )}

      {editingWatched && (
        <EditWatchedDialog
          title={title}
          onConfirm={(platform, lastWatchedAt) => {
            setEditingWatched(false);
            onEditWatched?.(title, platform, lastWatchedAt);
          }}
          onCancel={() => setEditingWatched(false)}
        />
      )}

      {trailer && (
        <TrailerModal
          title={title.title}
          trailerKey={trailer.key}
          loading={trailer.loading}
          onClose={() => setTrailer(null)}
        />
      )}
    </div>
  );
}

// The grid reaches 1500 cards and React would re-render all of them on every
// keystroke in the search box. Title objects stay identical between filters,
// so memo means only the cards that actually enter or leave the result set are
// redrawn.
export default memo(TitleCard);
