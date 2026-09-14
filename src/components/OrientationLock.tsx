"use client";

import { useEffect } from "react";
import { useLandscapeAllowed } from "@/lib/landscape";

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
 *
 * The lock lifts while a trailer is playing — where the API works it is what
 * would otherwise stop the phone rotating at all.
 */
export default function OrientationLock() {
  const landscapeAllowed = useLandscapeAllowed();

  useEffect(() => {
    const orientation: LockableOrientation | undefined = window.screen?.orientation;
    if (landscapeAllowed) {
      orientation?.unlock?.();
      return;
    }

    // The lock only works in fullscreen/standalone. Failing is not an error:
    // the overlay simply takes over.
    orientation?.lock?.("portrait").catch(() => {});

    return () => orientation?.unlock?.();
  }, [landscapeAllowed]);

  return null;
}
