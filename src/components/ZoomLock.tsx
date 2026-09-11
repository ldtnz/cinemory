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
 *
 * A trackpad pinch on desktop is a separate case again, and browser-specific
 * in the opposite direction: Safari fires the same "gesture*" events above,
 * but Chrome/Firefox/Edge never do — they report a trackpad pinch as a
 * "wheel" event with ctrlKey set (the same shape a real Ctrl+scroll zoom
 * has, since that is the keyboard equivalent of the gesture), so that has to
 * be blocked separately.
 */
export default function ZoomLock() {
  useEffect(() => {
    const block = (e: Event) => e.preventDefault();

    const blockMultiTouch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };

    const blockCtrlWheel = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };

    // Non-standard events, WebKit/Safari only.
    document.addEventListener("gesturestart", block);
    document.addEventListener("gesturechange", block);
    document.addEventListener("gestureend", block);
    // passive: false on both, otherwise preventDefault would be ignored.
    document.addEventListener("touchmove", blockMultiTouch, { passive: false });
    document.addEventListener("wheel", blockCtrlWheel, { passive: false });

    return () => {
      document.removeEventListener("gesturestart", block);
      document.removeEventListener("gesturechange", block);
      document.removeEventListener("gestureend", block);
      document.removeEventListener("touchmove", blockMultiTouch);
      document.removeEventListener("wheel", blockCtrlWheel);
    };
  }, []);

  return null;
}
