"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * The positioning/portal/dismissal shell shared by every custom right-click
 * / long-press menu in the catalog: clamped to the viewport once its real
 * size is known (starting flush with the cursor would let it render
 * off-screen for a frame), closed on an outside click, Escape, scroll, or
 * resize. Callers supply only their own menu items as children.
 */
export default function ContextMenuShell({
  x,
  y,
  onClose,
  children,
}: {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, visible: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { innerWidth, innerHeight } = window;
    const rect = el.getBoundingClientRect();
    const left = Math.min(x, innerWidth - rect.width - 8);
    const top = Math.min(y, innerHeight - rect.height - 8);
    setPosition({ left: Math.max(8, left), top: Math.max(8, top), visible: true });
  }, [x, y]);

  useEffect(() => {
    // On touch this menu opens mid-gesture, with the finger still down, and
    // letting go of it is itself dismissal-shaped: a touchend, usually a
    // compatibility mousedown right behind it, and on iOS sometimes a
    // rubber-band scroll. Every one of those would land here and close the
    // menu in the same motion that opened it — which is exactly what a
    // long-press felt like: it appeared, then vanished on release before it
    // could be tapped. So dismissal holds off until that release is over.
    // Escape needs no such wait: no long-press produces one.
    let armed = false;
    const arming = setTimeout(() => {
      armed = true;
    }, 350);

    function onPointerDown(e: Event) {
      if (!armed) return;
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDismiss() {
      if (armed) onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onDismiss, true);
    window.addEventListener("resize", onDismiss);
    return () => {
      clearTimeout(arming);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onDismiss, true);
      window.removeEventListener("resize", onDismiss);
    };
  }, [onClose]);

  // A portal's events still travel up the React tree, not the DOM one, so
  // everything aimed at this menu also reaches the card it was opened from —
  // whose own long-press handlers then treat it as a gesture on the card,
  // down to calling preventDefault() on the touch that ends it and so
  // cancelling the click on the menu item itself. Nothing in here is the
  // card's business, so none of it is passed along.
  const keepToSelf = (e: { stopPropagation: () => void }) => e.stopPropagation();

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onClick={keepToSelf}
      onPointerDown={keepToSelf}
      onPointerUp={keepToSelf}
      onPointerMove={keepToSelf}
      onPointerCancel={keepToSelf}
      onTouchStart={keepToSelf}
      onTouchEnd={keepToSelf}
      onContextMenu={keepToSelf}
      style={{ left: position.left, top: position.top }}
      // Width follows the longest item, with that width kept as the floor so
      // a short menu doesn't shrink below it.
      className={`fixed z-50 flex min-w-[152px] flex-col gap-0.5 rounded-2xl border border-white/10 bg-surface/95 p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur transition-opacity ${
        position.visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}
