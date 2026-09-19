"use client";

import Image from "next/image";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { Check, Minus, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { CatalogTitle } from "@/lib/catalog-title";
import { useCardContextMenu } from "@/lib/use-card-context-menu";
import { formatDate, platformStyle, seasonsLabel } from "@/lib/title-display";
import { useRevealOnView } from "@/lib/reveal-on-view";
import ConfirmDialog from "@/components/ConfirmDialog";
import TitleContextMenu from "@/components/TitleContextMenu";
import MarkWatchedDialog from "@/components/MarkWatchedDialog";
import EditWatchedDialog, { type SeasonEdit } from "@/components/EditWatchedDialog";
import { hasSeasonTotal } from "@/lib/season-counts";
import TrailerModal from "@/components/TrailerModal";
import TitleDetailsModal from "@/components/TitleDetailsModal";

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

function TitleCard({
  title,
  priority = false,
  editing = false,
  onRemove,
  onSeasons,
  onMarkWatched,
  onEditWatched,
  onDismissNewSeason,
  onMoveToWatchlist,
  selected = false,
  selectionActive = false,
  onToggleSelect,
  watchProviders,
}: {
  title: CatalogTitle;
  /** true for the first cards above the fold, avoids the Next/Image LCP warning */
  priority?: boolean;
  /** edit mode on: shows the delete button */
  editing?: boolean;
  onRemove?: (title: CatalogTitle) => void;
  onSeasons?: (title: CatalogTitle, watchedSeasons: number) => void;
  /** Moves a watchlist entry into the watched half, on the chosen platform. */
  onMarkWatched?: (title: CatalogTitle, platform: string, lastWatchedAt: Date | null) => void;
  /** Corrects the platform or watched date on an already-watched title. */
  onEditWatched?: (
    title: CatalogTitle,
    platform: string,
    lastWatchedAt: Date | null,
    seasons: SeasonEdit | null,
  ) => void;
  /** Clears the "new season available" badge (src/lib/season-check.ts). */
  onDismissNewSeason?: (title: CatalogTitle) => void;
  /** Sends an already-watched title back to the watchlist. */
  onMoveToWatchlist?: (title: CatalogTitle) => void;
  /** Part of the standing shift-click selection (see SelectionBar). */
  selected?: boolean;
  /** Something is already selected, so a plain click adds to the selection
   *  rather than opening anything: shift is only needed to start one. */
  selectionActive?: boolean;
  onToggleSelect?: (title: CatalogTitle) => void;
  /** Where this one is streaming right now, for watchlist entries — see
   *  src/lib/use-watch-providers.ts. Undefined while the answer is on its
   *  way, and empty when there is nowhere. */
  watchProviders?: string[];
}) {
  const [loaded, setLoaded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [markingWatched, setMarkingWatched] = useState(false);
  const [editingWatched, setEditingWatched] = useState(false);
  const [trailer, setTrailer] = useState<{ loading: boolean; key: string | null } | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Tapping a poster on touch shows the details overlay that desktop gets on
  // hover, then hides it again after a few seconds — touch has no hover.
  const [tapDetailsVisible, setTapDetailsVisible] = useState(false);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealRef = useRevealOnView();
  // Every dialog this card can open, from the context menu or from the
  // buttons on the card itself. The grid stays blurred behind all of them
  // rather than flashing sharp between the menu closing and the dialog
  // opening — see the hook.
  const dialogOpen =
    confirmingDelete || markingWatched || editingWatched || detailsOpen || trailer !== null;
  const { cardRef, menuPos, openContextMenuOnCard, closeContextMenu, longPressFiredRef, cardHandlers } =
    useCardContextMenu<HTMLDivElement>(dialogOpen);

  // One ref for the card's root, stable across renders. An inline arrow here
  // is a new function every time, which React reads as a different ref: it
  // calls the old one with null and the new one with the same node, and the
  // reveal observer duly played the entrance animation again — the card
  // blinked out and faded back in every time it was selected.
  const setCardNode = useCallback(
    (node: HTMLDivElement | null) => {
      cardRef.current = node;
      revealRef(node);
    },
    [cardRef, revealRef],
  );

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    };
  }, []);

  // A dialog hands the keyboard back to whatever opened it (see
  // useDialogFocus), but from a card that is the context menu, which is gone
  // by then — so focus would land nowhere and the grid would start again from
  // the top on the next Tab. The card takes it back itself, and only when
  // nothing else has claimed it in the meantime.
  const dialogWasOpen = useRef(false);
  useEffect(() => {
    if (dialogWasOpen.current && !dialogOpen) {
      const card = cardRef.current;
      const active = document.activeElement;
      if (card && (active === null || active === document.body)) card.focus();
    }
    dialogWasOpen.current = dialogOpen;
  }, [dialogOpen, cardRef]);

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

  function handleTap(e: ReactMouseEvent) {
    // Shift-click picks titles out to act on together rather than opening
    // anything — see SelectionBar. Only a mouse can hold shift, so this is
    // silently a desktop gesture. Once a selection is standing, a plain
    // click goes on adding to it: holding shift for every title after the
    // first is a chore, and there is nothing else a click could mean while
    // the selection bar is up.
    if ((e.shiftKey || selectionActive) && onToggleSelect) {
      onToggleSelect(title);
      return;
    }
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

  /**
   * The card is the only way to reach a title's actions, and they all live in
   * the context menu — so the keyboard opens that, rather than the details
   * overlay a tap shows, which is decoration a screen reader already reads
   * from the label. Shift is the same modifier a mouse uses to pick titles
   * out for a batch.
   */
  function handleKeyDown(e: ReactKeyboardEvent) {
    if (e.target !== e.currentTarget) return;
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if ((e.shiftKey || selectionActive) && onToggleSelect) {
      onToggleSelect(title);
      return;
    }
    openContextMenuOnCard();
  }

  const platform = platformStyle(title.platform);
  const platformColor = platform.color;
  const platformLabel = platform.label;
  const seasons = seasonsLabel(title);

  const subtitle = [
    title.mediaType,
    title.year ?? (title.lastWatchedAt ? formatDate(title.lastWatchedAt) : null),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      ref={setCardNode}
      // How the grid finds this node to take it apart on its way out; see
      // src/lib/pixel-dissolve.ts.
      data-title-id={title.id}
      // A poster with a click handler is a button to everyone except a
      // keyboard and a screen reader, which had no way in at all: no focus,
      // no name, no actions. The label carries what the overlay shows on
      // hover, since that overlay is decoration here.
      role="button"
      tabIndex={0}
      aria-label={[title.title, subtitle, seasons, platformLabel]
        .filter(Boolean)
        .join(", ")}
      aria-pressed={selectionActive ? selected : undefined}
      className={`title-card reveal-item group relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-select ${
        selected ? "ring-1 ring-accent-select" : ""
      }`}
      onClick={handleTap}
      onKeyDown={handleKeyDown}
      {...cardHandlers}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-accent-select text-background"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      )}

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
          className="absolute left-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white opacity-0 transition-opacity duration-150 hover:bg-black/85 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100"
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
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-red-500 text-white opacity-0 transition-opacity duration-150 hover:bg-red-400 group-hover:opacity-100 group-focus-visible:opacity-100 focus-visible:opacity-100"
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
            {(title.totalSeasons ?? 0) > 0 ? `/${title.totalSeasons}` : ""}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeasons?.(title, (title.watchedSeasons ?? 0) + 1);
            }}
            disabled={
              hasSeasonTotal(title.totalSeasons) &&
              (title.watchedSeasons ?? 0) >= (title.totalSeasons as number)
            }
            aria-label={`One season more for ${title.title}`}
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-white/10 text-white disabled:opacity-30"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {/* details overlay, shown on hover (always when there is no poster: the title is already displayed above) */}
      {title.posterUrl && (
        <div
          className={`title-card__details pointer-events-none absolute inset-x-0 bottom-0 rounded-b-2xl bg-gradient-to-t from-black/95 via-black/70 to-transparent p-2.5 pt-7 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 ${
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
          {/* A watched title says where it was watched; one still to watch
              says where it can be, which is the only useful thing to know
              about it tonight. */}
          {platformLabel ? (
            <p className={`mt-0.5 text-[10px] font-semibold ${platformColor}`}>
              {platformLabel}
            </p>
          ) : watchProviders && watchProviders.length > 0 ? (
            <p className="mt-0.5 line-clamp-1 text-[10px] font-semibold text-accent-2">
              {watchProviders.slice(0, 2).join(" · ")}
              {watchProviders.length > 2 ? ` +${watchProviders.length - 2}` : ""}
            </p>
          ) : null}
          {seasons && (
            <p className="mt-0.5 text-[10px] text-neutral-400">{seasons}</p>
          )}
        </div>
      )}

      {menuPos && (
        <TitleContextMenu
          x={menuPos.x}
          y={menuPos.y}
          hasTrailerSource={Boolean(title.tmdbId && title.tmdbId > 0)}
          onWatchlist={title.inWatchlist}
          onDetails={() => setDetailsOpen(true)}
          onTrailer={openTrailer}
          onMarkWatched={() => setMarkingWatched(true)}
          onMoveToWatchlist={
            title.inWatchlist || !onMoveToWatchlist
              ? undefined
              : () => onMoveToWatchlist(title)
          }
          // The same dialog the pencil opens on a card in edit mode: on a
          // phone there is no hover to reveal that button, so the menu is
          // the only way to reach it.
          onEdit={title.inWatchlist ? undefined : () => setEditingWatched(true)}
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
          titles={[title]}
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
          onConfirm={(platform, lastWatchedAt, seasons) => {
            setEditingWatched(false);
            onEditWatched?.(title, platform, lastWatchedAt, seasons);
          }}
          onCancel={() => setEditingWatched(false)}
        />
      )}

      {detailsOpen && (
        <TitleDetailsModal
          title={title}
          // Handing over rather than stacking: the trailer is the bigger of
          // the two and would otherwise open behind a dialog that is still
          // holding the keyboard.
          onTrailer={
            title.tmdbId && title.tmdbId > 0
              ? () => {
                  setDetailsOpen(false);
                  void openTrailer();
                }
              : undefined
          }
          onClose={() => setDetailsOpen(false)}
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
// keystroke in the search box. CatalogTitle objects stay identical between filters,
// so memo means only the cards that actually enter or leave the result set are
// redrawn.
export default memo(TitleCard);
