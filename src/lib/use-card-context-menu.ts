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
/**
 * The card whose long-press is currently in progress, shared across every
 * card in the grid.
 *
 * Each card keeps its own state, so without this two fingers landing on two
 * posters simply ran two timers and opened two menus at once. The first
 * press claims the gesture and any other card ignores its own until that one
 * is over. The timestamp is only there so a claim can never outlive the
 * press that made it — if a pointerup is ever lost, the next press a few
 * seconds later takes over rather than finding the grid permanently deaf.
 */
let activePress: { owner: object; at: number } | null = null;
const CLAIM_STALE_MS = 5000;

function claimPress(owner: object): boolean {
  if (activePress && activePress.owner !== owner && Date.now() - activePress.at < CLAIM_STALE_MS) {
    return false;
  }
  activePress = { owner, at: Date.now() };
  return true;
}

function releasePress(owner: object) {
  if (activePress?.owner === owner) activePress = null;
}

export function useCardContextMenu<T extends HTMLElement>(
  /** Whether the card currently has a dialog of its own open. The menu hands
   *  the grid's blur over to it rather than dropping it — see the effect
   *  below. Cards with no dialogs (DiscoverCard) leave it at false. */
  dialogOpen = false,
) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<T>(null);
  /** This card's identity in the claim above — a stable object, nothing more. */
  const pressOwnerRef = useRef({});
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  // Also read by a caller's own tap handler (see TitleCard's handleTap): the
  // tap that ends a long-press still fires a click on release, which should
  // open the menu, not also trigger whatever a plain tap does.
  const longPressFiredRef = useRef(false);

  useEffect(() => {
    const owner = pressOwnerRef.current;
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      // Unmounting mid-press (the grid re-renders on a filter change, say)
      // would otherwise leave the claim standing with no one to drop it.
      releasePress(owner);
    };
  }, []);

  /**
   * Whether an event actually happened on the card.
   *
   * The menu this hook opens is rendered as a child of the card in the React
   * tree even though it is portalled to the body, and React propagates a
   * portal's events up that tree — so without this, a tap on a menu item
   * arrives here indistinguishable from a tap on the poster. The shell stops
   * those at the source; this is the same rule stated where the assumption
   * lives, and it covers any other portalled child a card may grow.
   */
  function startedOnCard(e: { target: EventTarget | null }): boolean {
    const card = cardRef.current;
    if (!card) return true;
    return e.target instanceof Node && card.contains(e.target);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function openContextMenu(x: number, y: number) {
    setMenuPos({ x, y });
  }

  function closeContextMenu() {
    setMenuPos(null);
  }

  /**
   * Dims and blurs the rest of the grid so the card being acted on stands
   * out. Toggled directly on the DOM rather than through React state, so it
   * never re-renders the (up to 1500-card) grid.
   *
   * The menu and any dialog it opens share one blur. Menu items act and then
   * close the menu, so tearing the blur down on close and having the dialog's
   * own backdrop build it again showed a frame with neither: the background
   * snapped sharp and then blurred a second time. Driving it from "menu or
   * dialog" instead keeps it up across the handover, and the acted-on card
   * stops being the exception once the menu is gone — with no menu pinned
   * over it there is nothing left to keep sharp, and an evenly blurred grid
   * behind the dialog reads better than one card floating in focus.
   */
  useEffect(() => {
    const card = cardRef.current;
    const grid = card?.closest<HTMLElement>(".title-grid");
    if (!grid || !card || (!menuPos && !dialogOpen)) return;
    // Another card may have been left marked if its own cleanup never ran.
    grid
      .querySelectorAll(".title-card--context-target")
      .forEach((el) => el !== card && el.classList.remove("title-card--context-target"));
    grid.classList.add("title-grid--context-open");
    card.classList.toggle("title-card--context-target", Boolean(menuPos));
    return () => {
      grid.classList.remove("title-grid--context-open");
      card.classList.remove("title-card--context-target");
    };
  }, [menuPos, dialogOpen]);

  function handleContextMenu(e: ReactMouseEvent) {
    if (!startedOnCard(e)) return;
    e.preventDefault();
    e.stopPropagation();
    // Touch is handled by the pointer-based long-press detection below:
    // Android does fire this event for a long-press, iOS Safari never does,
    // so touch relies on one path only to avoid opening it twice.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    openContextMenu(e.clientX, e.clientY);
  }

  function handlePointerDown(e: ReactPointerEvent) {
    if (e.pointerType !== "touch" || !startedOnCard(e)) return;
    // Another poster is already being held: that press opens its menu, this
    // one does nothing at all.
    if (!claimPress(pressOwnerRef.current)) return;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressFiredRef.current = false;
    clearLongPressTimer();
    const cx = e.clientX;
    const cy = e.clientY;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      // A short tick the moment the press is recognised, so the menu is felt
      // before it is seen. Android and desktop Chrome implement this; iOS
      // exposes no vibration to web apps at all, in a PWA or otherwise, so
      // there it is simply absent.
      navigator.vibrate?.(12);
      openContextMenu(cx, cy);
    }, 500);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    if (e.pointerType !== "touch" || !longPressStartRef.current) return;
    if (!startedOnCard(e)) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    // A real long-press stays still; a scroll or drag moves past a small
    // threshold and should cancel it instead of opening the menu mid-swipe.
    if (Math.hypot(dx, dy) > 10) clearLongPressTimer();
  }

  function handlePointerEnd(e: ReactPointerEvent) {
    if (e.pointerType !== "touch" || !startedOnCard(e)) return;
    clearLongPressTimer();
    releasePress(pressOwnerRef.current);
    longPressStartRef.current = null;
    // A cancelled touch is never followed by a click, so the flag that guards
    // against that click has nothing left to guard and must not be left
    // standing — it would swallow the next real tap instead. (iOS cancels a
    // touch it has decided was a system gesture, which a long-press can be.)
    if (e.type === "pointercancel") longPressFiredRef.current = false;
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
    if (!startedOnCard(e)) return;
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
