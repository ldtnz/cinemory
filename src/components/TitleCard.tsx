"use client";

import Image from "next/image";
import { memo, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import type { Title } from "@prisma/client";
import { setEditMode } from "@/lib/edit-mode";
import ConfirmDialog from "@/components/ConfirmDialog";
import TitleContextMenu from "@/components/TitleContextMenu";

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
  Cinema: { color: "text-amber-400", label: "Cinema" },
};

function TitleCard({
  title,
  priority = false,
  editing = false,
  onRemove,
  onSeasons,
}: {
  title: Title;
  /** true for the first cards above the fold, avoids the Next/Image LCP warning */
  priority?: boolean;
  /** edit mode on: shows the delete button */
  editing?: boolean;
  onRemove?: (title: Title) => void;
  onSeasons?: (title: Title, watchedSeasons: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Tapping a poster on touch shows the details overlay that desktop gets on
  // hover, then hides it again after a few seconds — touch has no hover.
  const [tapDetailsVisible, setTapDetailsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Manual long-press timer for touch: iOS Safari (including the installed
  // PWA) never fires a "contextmenu" DOM event for a long-press on a plain
  // element — only Android does. This is what makes long-press work there too.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function requestDelete() {
    setConfirmingDelete(true);
  }

  // Dims and blurs every other card in the grid so the one under the cursor
  // stands out, without re-rendering the rest of the (up to 1500-card) grid:
  // toggled directly on the DOM rather than through React state.
  function openContextMenu(x: number, y: number) {
    const card = cardRef.current;
    const grid = card?.closest<HTMLElement>(".title-grid");
    if (grid && card) {
      grid
        .querySelectorAll(".title-card--context-target")
        .forEach((el) => el.classList.remove("title-card--context-target"));
      grid.classList.add("title-grid--context-open");
      card.classList.add("title-card--context-target");
    }
    setMenuPos({ x, y });
  }

  function closeContextMenu() {
    const card = cardRef.current;
    const grid = card?.closest<HTMLElement>(".title-grid");
    grid?.classList.remove("title-grid--context-open");
    card?.classList.remove("title-card--context-target");
    setMenuPos(null);
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

  function handlePointerDown(e: ReactPointerEvent) {
    if (e.pointerType !== "touch") return;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressFiredRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
    clearLongPressTimer();
    const cx = e.clientX;
    const cy = e.clientY;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      openContextMenu(cx, cy);
    }, 500);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (e.pointerType !== "touch" || !longPressStartRef.current) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    // A real long-press stays still; a scroll or drag moves past a small
    // threshold and should cancel it instead of opening the menu mid-swipe.
    if (Math.hypot(dx, dy) > 10) clearLongPressTimer();
  }

  function handlePointerEnd(e: ReactPointerEvent) {
    if (e.pointerType !== "touch") return;
    clearLongPressTimer();
    longPressStartRef.current = null;
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
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Touch is handled by the pointer-based long-press detection below:
        // Android does fire this event for a long-press, iOS Safari never
        // does, so touch relies on one path only to avoid opening it twice.
        if (window.matchMedia("(pointer: coarse)").matches) return;
        openContextMenu(e.clientX, e.clientY);
      }}
      onClick={handleTap}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onTouchEnd={(e) => {
        // Without this, the browser follows the touch with a synthetic
        // mousedown/click for compatibility — which would land on the card
        // and immediately close the menu the long-press above just opened,
        // via TitleContextMenu's own outside-click listener. Suppressing it
        // also means the click that would have reset the flag never fires,
        // so it is reset here instead.
        if (longPressFiredRef.current) {
          e.preventDefault();
          longPressFiredRef.current = false;
        }
      }}
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
            className={`object-cover transition-opacity duration-300 ${
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

      {editing && title.mediaType === "Series" && (
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
          <p className={`mt-0.5 text-[10px] font-semibold ${platformColor}`}>
            {platformLabel}
          </p>
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
    </div>
  );
}

// The grid reaches 1500 cards and React would re-render all of them on every
// keystroke in the search box. Title objects stay identical between filters,
// so memo means only the cards that actually enter or leave the result set are
// redrawn.
export default memo(TitleCard);
