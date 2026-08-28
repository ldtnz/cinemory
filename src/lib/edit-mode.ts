"use client";

import { useSyncExternalStore } from "react";

/**
 * The "edit and remove" switch, turned on from the settings page and read by
 * the catalog.
 *
 * It lives in localStorage because the two pages are separate and the mode has
 * to survive navigation. It goes through useSyncExternalStore rather than
 * state set inside an effect: that way the value read while rendering on the
 * server is always false (no hydration mismatch) and the two pages stay in
 * sync even when opened in different tabs.
 */
const KEY = "cinemory:edit-mode";

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // "storage" only fires in other tabs; setEditMode notifies this one.
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private browsing or blocked storage: the mode simply is not remembered,
    // which is not an error worth surfacing.
    return false;
  }
}

export function setEditMode(active: boolean) {
  try {
    if (active) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // ignored: it just applies to this session
  }
  notify();
}

export function useEditMode(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
