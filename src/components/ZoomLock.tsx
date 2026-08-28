"use client";

import { useEffect } from "react";

/**
 * Disables pinch and double-tap zoom.
 *
 * The viewport meta tag with "user-scalable=no" is enough on Android and in
 * the installed PWA, but Safari on iOS ignores it when the site runs inside
 * the browser: there the only way is to cancel the "gesture*" events (pinch)
 * and multi-finger touchmoves. Double-tap zoom is already covered by the
 * "touch-action: manipulation" rule in globals.css.
 */
export default function ZoomLock() {
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();

    const blockMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    // Non-standard events, WebKit/Safari only.
    document.addEventListener("gesturestart", block);
    document.addEventListener("gesturechange", block);
    document.addEventListener("gestureend", block);
    // passive: false, otherwise preventDefault would be ignored.
    document.addEventListener("touchmove", blockMultiTouch, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
      document.removeEventListener("gestureend", block);
      document.removeEventListener("touchmove", blockMultiTouch);
    };
  }, []);

  return null;
}
