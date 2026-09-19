"use client";

import { useEffect, useRef } from "react";
import { useScrollLock } from "@/lib/use-scroll-lock";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps the keyboard inside a dialog while it is open, and puts it back
 * afterwards.
 *
 * Every dialog here declared aria-modal and none of them acted like one: focus
 * stayed on whatever opened them, Tab walked the page behind, and closing one
 * left focus wherever it had wandered to. With a pointer that is invisible;
 * from the keyboard it means the "delete this title?" confirmation cannot be
 * answered without tabbing blindly through the grid underneath it.
 *
 * The first focusable element gets the focus — which in the confirmations is
 * Cancel, the harmless one, because it comes first in the markup for exactly
 * this reason.
 */
export function useDialogFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  // Trapping the keyboard and letting the page scroll away under the pointer
  // are the same bug with two inputs, so every dialog gets both from here.
  useScrollLock();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Where to give it back. A dialog opened from a card returns the keyboard
    // to that card, so the grid does not start again from the top.
    const opener = document.activeElement as HTMLElement | null;

    function focusable(): HTMLElement[] {
      return Array.from(dialog!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    }

    const first = focusable()[0];
    if (first) {
      first.focus();
    } else {
      // Nothing to focus (a trailer, a picture): the panel itself takes it, so
      // that at least Escape and the screen reader have somewhere to be.
      dialog.tabIndex = -1;
      dialog.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? dialog!.contains(active) : false;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];

      // Wrapping at both ends, and catching the case where focus has somehow
      // ended up outside the dialog altogether.
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? lastItem : firstItem).focus();
        return;
      }
      if (e.shiftKey && active === firstItem) {
        e.preventDefault();
        lastItem.focus();
        return;
      }
      if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only if it is still there: the card a dialog was opened from may have
      // been deleted by what the dialog did.
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return ref;
}
