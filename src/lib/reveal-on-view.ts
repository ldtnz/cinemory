"use client";

import { useCallback, useRef } from "react";

/**
 * Cards fade in as they come into view, a beat apart, rather than on mount.
 *
 * Mounting is the wrong moment: the grid loads the next batch while it is
 * still a screen below the fold (see Catalog.tsx), so an animation tied to
 * mounting would be over before the reader ever got there — they would just
 * find the titles already sitting in place. Watching for the crossing
 * instead means the wave plays wherever it is actually being looked at: the
 * first screen, a switch between Watched and "To watch", or the next batch
 * scrolled into view.
 *
 * One observer serves every card on the page. Everything that crosses in the
 * same callback is treated as one wave and staggered in document order, which
 * is what turns a row arriving into a ripple rather than a block.
 */
const STAGGER_STEP = 8;
/** Past this the wave would outlast the scroll that started it. */
const MAX_STAGGER = 12;

let observer: IntersectionObserver | null = null;

function inDocumentOrder(a: Element, b: Element): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function sharedObserver(): IntersectionObserver {
  if (observer) return observer;
  // Only now, once something is actually being observed, is it safe for the
  // stylesheet to hide what has not been revealed yet: if this module never
  // runs, nothing hides and the grid simply appears.
  document.documentElement.classList.add("reveal-ready");
  observer = new IntersectionObserver((entries) => {
    entries
      .filter((e) => e.isIntersecting)
      .map((e) => e.target as HTMLElement)
      .sort(inDocumentOrder)
      .forEach((el, i) => {
        el.style.setProperty("--stagger", String(Math.min(i, MAX_STAGGER) * STAGGER_STEP));
        el.classList.add("is-revealed");
        observer?.unobserve(el);
      });
  });
  return observer;
}

/** Ref callback for a card's root element. */
export function useRevealOnView() {
  const observed = useRef<HTMLElement | null>(null);
  return useCallback((node: HTMLElement | null) => {
    // Dropped explicitly rather than through a returned cleanup: the observer
    // holds what it watches, and the grid discards cards by the screenful.
    if (observed.current) observer?.unobserve(observed.current);
    observed.current = node;
    if (node) sharedObserver().observe(node);
  }, []);
}
