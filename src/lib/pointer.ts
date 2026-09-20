"use client";

/**
 * Whether this device points rather than touches.
 *
 * The same question the CSS asks before it draws a hover state, in the same
 * words — so the affordances that stand in for hover appear exactly where
 * hover does not. Read at the moment it matters rather than stored: a laptop
 * with a touchscreen answers differently depending on what was last used,
 * and a tablet can gain a pointer halfway through a session.
 */
export function hasHoverPointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
