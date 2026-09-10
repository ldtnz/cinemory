"use client";

import { useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from "react";

/**
 * Right-click (desktop) / long-press (touch) to open a card's context menu —
 * shared by every grid of title-shaped cards (the catalog and the TMDB
 * discovery grid) so the gesture, and the dimming of every other card in the
 * grid while it's open, behaves identically everywhere it appears.
 *
 * iOS Safari never fires a native "contextmenu" event for a long-press on a
 * plain element (only Android does), so touch is handled by a manual
 * pointer-based timer instead of relying on that event at all. The caller
 * spreads `cardHandlers` onto its root element (which must also carry the
 * `title-card` class and sit directly inside a `.title-grid`, for the dim/
 * blur CSS in globals.css to find it) and renders its menu when `menuPos` is
 * set.
 */
export function useCardContextMenu<T extends HTMLElement>() {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<T>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  // Also read by a caller's own tap handler (see TitleCard's handleTap): the
  // tap that ends a long-press still fires a click on release, which should
  // open the menu, not also trigger whatever a plain tap does.
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
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

  function handleContextMenu(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Touch is handled by the pointer-based long-press detection below:
    // Android does fire this event for a long-press, iOS Safari never does,
    // so touch relies on one path only to avoid opening it twice.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    openContextMenu(e.clientX, e.clientY);
  }

  function handlePointerDown(e: ReactPointerEvent) {
    if (e.pointerType !== "touch") return;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressFiredRef.current = false;
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
    // Defensive: release capture if the browser implicitly granted it for
    // this touch, so it can never carry over and interfere with the very
    // next tap (e.g. on a button inside the menu this long-press opened).
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Not captured — nothing to release.
    }
  }

  function handleTouchEnd(e: ReactTouchEvent) {
    // Without this, the browser follows the touch with a synthetic
    // mousedown/click for compatibility — which would land on the card and
    // immediately close the menu the long-press above just opened, via the
    // menu's own outside-click listener. Suppressing it also means the click
    // that would have reset the flag never fires, so it is reset here
    // instead.
    if (longPressFiredRef.current) {
      e.preventDefault();
      longPressFiredRef.current = false;
    }
  }

  return {
    cardRef,
    menuPos,
    closeContextMenu,
    longPressFiredRef,
    cardHandlers: {
      onContextMenu: handleContextMenu,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      onTouchEnd: handleTouchEnd,
    },
  };
}
