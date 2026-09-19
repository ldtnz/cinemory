"use client";

import { useEffect } from "react";

/**
 * Holds the page still while a dialog is open.
 *
 * `overflow: hidden` on the body is the usual answer and is not enough:
 * Safari on iOS goes on scrolling the page behind the dialog regardless, so
 * dismissing a confirmation could leave the grid somewhere else entirely.
 * Taking the body out of flow and pinning it at the offset it was already at
 * is what holds everywhere; the offset is restored on release, so nothing
 * jumps when the dialog closes.
 *
 * Counted rather than toggled: dialogs do open over each other (a
 * confirmation from a dialog, a trailer from the details view), and the first
 * one to close must not hand the page back while another is still up.
 */
let depth = 0;
let release: (() => void) | null = null;

function lock() {
  depth += 1;
  if (depth > 1) return;

  const body = document.body;
  const offset = window.scrollY;
  // Pinning the body removes the document's scrollbar, and the page under the
  // dialog would slide sideways by its width as it goes. Standing in for it
  // keeps everything where it was. Zero on a phone and on overlay scrollbars.
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
  };

  body.style.position = "fixed";
  body.style.top = `-${offset}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.overflow = "hidden";
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

  release = () => {
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.right = previous.right;
    body.style.overflow = previous.overflow;
    body.style.paddingRight = previous.paddingRight;
    window.scrollTo(0, offset);
  };
}

function unlock() {
  depth = Math.max(0, depth - 1);
  if (depth > 0) return;
  release?.();
  release = null;
}

/** Locks for as long as the component is mounted, or while `active`. */
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
