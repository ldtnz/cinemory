"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the app is currently showing something that is allowed to be turned
 * sideways — in practice, a playing trailer.
 *
 * The app is portrait-only, enforced in three separate places: the manifest,
 * the Screen Orientation API (OrientationLock) and, for iOS which honours
 * neither, the LandscapeNotice overlay. A trailer is the one thing worth
 * rotating the phone for, so all three have to stand down together, which is
 * what this exists to coordinate.
 *
 * The flag is mirrored onto <html> as a class so the notice — which is pure
 * CSS, with no React behind it — can see it too.
 */
const CLASS = "landscape-ok";

let allowed = false;
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function setLandscapeAllowed(value: boolean) {
  if (allowed === value) return;
  allowed = value;
  document.documentElement.classList.toggle(CLASS, value);
  for (const l of listeners) l();
}

export function useLandscapeAllowed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => allowed,
    () => false,
  );
}
