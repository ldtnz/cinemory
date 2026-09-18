"use client";

import { useEffect, useRef } from "react";

/**
 * Lets a sideways-scrolling row be scrolled with an ordinary mouse wheel.
 *
 * A trackpad sends a horizontal delta of its own, so two-finger swiping over
 * such a row works on a Mac without any help. A wheel only sends `deltaY`,
 * and no browser turns that into horizontal movement on its own: the event
 * finds nothing vertical to scroll here and chains to the page instead, so
 * the row looks frozen. Shift+wheel does work, but nobody discovers that.
 *
 * The delta is only consumed while there is somewhere to go in that
 * direction; at either end the event is left alone so the page scrolls as it
 * would have. The listener is registered by hand rather than through `onWheel`
 * because React attaches wheel handlers passively, where `preventDefault` is
 * ignored.
 */
export function useHorizontalWheel<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    function onWheel(e: WheelEvent) {
      const el = element!;
      // A trackpad's own horizontal gesture needs no translating.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const room = el.scrollWidth - el.clientWidth;
      if (room <= 0) return;
      const next = Math.max(0, Math.min(room, el.scrollLeft + e.deltaY));
      if (next === el.scrollLeft) return;
      e.preventDefault();
      el.scrollLeft = next;
    }

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  return ref;
}
