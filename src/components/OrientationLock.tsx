"use client";

import { useEffect } from "react";

/** lock/unlock are not part of the standard ScreenOrientation types. */
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "portrait") => Promise<void>;
  unlock?: () => void;
};

/**
 * Locks the phone to portrait where the browser allows it (Android, installed
 * PWA). iOS implements neither the lock nor the manifest's
 * "orientation: portrait", so there the fallback is the LandscapeNotice
 * overlay, shown by a media query in globals.css.
 */
export default function OrientationLock() {
  useEffect(() => {
    const orientation: LockableOrientation | undefined = window.screen?.orientation;

    // The lock only works in fullscreen/standalone. Failing is not an error:
    // the overlay simply takes over.
    orientation?.lock?.("portrait").catch(() => {});

    return () => orientation?.unlock?.();
  }, []);

  return null;
}
